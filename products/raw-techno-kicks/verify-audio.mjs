import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const packRootArgument = args.find((argument) => !argument.startsWith("--"));
const approvalRequested = args.includes("--human-approved");
const archiveReopen = Boolean(packRootArgument);
const packRoot = packRootArgument
  ? resolve(packRootArgument)
  : join(root, "pack", "Raw_Techno_Kick_Architecture_by_Hologram_People");
const approvalPath = join(root, "AUDIO_APPROVAL.json");
const archivePath = join(root, "dist", "Raw_Techno_Kick_Architecture_by_Hologram_People.zip");
const reelPath = join(root, "qa", "RTKA_Audition_Reel.mp3");
const families = new Map([
  ["01_Deep", { label: "Deep", count: 10, minimumDuration: 1.69, maximumDuration: 1.87, exactMono: true }],
  ["02_Punch", { label: "Punch", count: 10, minimumDuration: 1.24, maximumDuration: 1.42, exactMono: true }],
  ["03_Industrial", { label: "Industrial", count: 10, minimumDuration: 1.79, maximumDuration: 1.97 }],
  ["04_Rumble", { label: "Rumble", count: 10, minimumDuration: 2.79, maximumDuration: 2.97 }],
]);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    files.push(...(entry.isDirectory() ? await walk(path) : [path]));
  }
  return files;
}

function run(command, commandArgs) {
  try {
    return execFileSync(command, commandArgs, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(`${command} failed:\n${error.stdout ?? ""}${error.stderr ?? ""}`);
  }
}

function sha256File(path) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectHash);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function toDbfs(amplitude) {
  return amplitude > 0 ? Number((20 * Math.log10(amplitude)).toFixed(2)) : null;
}

function inspectPcm24(wav) {
  if (
    wav.length < 44 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Invalid RIFF/WAVE header.");
  }
  const dataMarker = wav.indexOf(Buffer.from("data"));
  if (dataMarker < 0) throw new Error("Missing WAV data chunk.");
  const dataStart = dataMarker + 8;
  const dataBytes = wav.readUInt32LE(dataMarker + 4);
  const dataEnd = dataStart + dataBytes;
  if (dataEnd > wav.length || dataBytes % 6 !== 0) {
    throw new Error("Truncated or misaligned stereo PCM data.");
  }

  const frames = dataBytes / 6;
  if (frames === 0) throw new Error("WAV contains no audio frames.");
  const lowPassCoefficient = 1 - Math.exp((-2 * Math.PI * 120) / 48_000);
  const tailStart = Math.max(0, frames - 240);
  const boundary = {};
  let sumLeft = 0;
  let sumRight = 0;
  let squareLeft = 0;
  let squareRight = 0;
  let squareMid = 0;
  let squareSide = 0;
  let product = 0;
  let samplePeak = 0;
  let clippedSamples = 0;
  let tailPeak = 0;
  let maxStereoDifference = 0;
  let lowMidState = 0;
  let lowSideState = 0;
  let lowMidSquares = 0;
  let lowSideSquares = 0;

  for (let frame = 0; frame < frames; frame += 1) {
    const offset = dataStart + frame * 6;
    const left = wav.readIntLE(offset, 3) / 8_388_608;
    const right = wav.readIntLE(offset + 3, 3) / 8_388_608;
    const peak = Math.max(Math.abs(left), Math.abs(right));
    const mid = (left + right) * 0.5;
    const side = (left - right) * 0.5;
    lowMidState += lowPassCoefficient * (mid - lowMidState);
    lowSideState += lowPassCoefficient * (side - lowSideState);
    lowMidSquares += lowMidState * lowMidState;
    lowSideSquares += lowSideState * lowSideState;
    if (frame === 0) Object.assign(boundary, { first_left: left, first_right: right });
    if (frame === frames - 1) Object.assign(boundary, { last_left: left, last_right: right });
    samplePeak = Math.max(samplePeak, peak);
    maxStereoDifference = Math.max(maxStereoDifference, Math.abs(left - right));
    if (peak >= 0.999_999) clippedSamples += 1;
    if (frame >= tailStart) tailPeak = Math.max(tailPeak, peak);
    sumLeft += left;
    sumRight += right;
    squareLeft += left * left;
    squareRight += right * right;
    squareMid += mid * mid;
    squareSide += side * side;
    product += left * right;
  }

  const meanLeft = sumLeft / frames;
  const meanRight = sumRight / frames;
  const varianceLeft = Math.max(0, squareLeft / frames - meanLeft ** 2);
  const varianceRight = Math.max(0, squareRight / frames - meanRight ** 2);
  const covariance = product / frames - meanLeft * meanRight;
  const correlationDenominator = Math.sqrt(varianceLeft * varianceRight);
  const stereoRms = Math.sqrt((squareLeft + squareRight) / (frames * 2));
  const midRms = Math.sqrt(squareMid / frames);
  const lowMidRms = Math.sqrt(lowMidSquares / frames);
  const lowSideRms = Math.sqrt(lowSideSquares / frames);

  return {
    frame_count: frames,
    sample_peak_dbfs: toDbfs(samplePeak),
    rms_dbfs: toDbfs(stereoRms),
    mid_rms_dbfs: toDbfs(midRms),
    side_rms_dbfs: toDbfs(Math.sqrt(squareSide / frames)),
    low_band_side_to_mid_db:
      lowSideRms > 0 && lowMidRms > 0
        ? Number((20 * Math.log10(lowSideRms / lowMidRms)).toFixed(2))
        : null,
    maximum_stereo_difference: Number(maxStereoDifference.toFixed(8)),
    dc_offset_left: Number(meanLeft.toFixed(8)),
    dc_offset_right: Number(meanRight.toFixed(8)),
    stereo_correlation:
      correlationDenominator > 0 ? Number((covariance / correlationDenominator).toFixed(6)) : null,
    clipped_samples: clippedSamples,
    final_5ms_peak_dbfs: toDbfs(tailPeak),
    boundary,
  };
}

const expectedPaths = [];
const expectedMetadata = new Map();
for (const [folder, family] of families) {
  for (let index = 1; index <= family.count; index += 1) {
    const number = String(index).padStart(2, "0");
    const path = `${folder}/RTKA_Kick_${family.label}_${number}.wav`;
    expectedPaths.push(path);
    expectedMetadata.set(path, { folder, family });
  }
}
const expectedSet = new Set(expectedPaths);
const failures = [];
let allFiles = [];
try {
  allFiles = await walk(packRoot);
} catch (error) {
  failures.push(`Pack root could not be read: ${error.message}`);
}
const wavFiles = allFiles.filter((file) => extname(file).toLowerCase() === ".wav").sort();
const actualPaths = wavFiles.map((file) => relative(packRoot, file));
const actualSet = new Set(actualPaths);
for (const path of expectedPaths) if (!actualSet.has(path)) failures.push(`Missing expected WAV: ${path}.`);
for (const path of actualPaths) if (!expectedSet.has(path)) failures.push(`Unexpected WAV: ${path}.`);
if (wavFiles.length !== 40) failures.push(`Expected 40 WAV files; found ${wavFiles.length}.`);

for (const name of ["README.txt", "LICENSE.txt", "MANIFEST.json"]) {
  try {
    if ((await stat(join(packRoot, name))).size === 0) failures.push(`${name} is empty.`);
  } catch (error) {
    failures.push(`${name} is missing or unreadable: ${error.message}`);
  }
}

try {
  const manifest = JSON.parse(await readFile(join(packRoot, "MANIFEST.json"), "utf8"));
  const entries = manifest.files ?? [];
  const manifestPaths = new Set(entries.map((entry) => entry.file));
  if (manifest.product !== "Raw Techno Kick Architecture") failures.push("Manifest product identity is incorrect.");
  if (manifest.artist !== "Hologram People") failures.push("Manifest artist identity is incorrect.");
  if (manifestPaths.size !== 40) failures.push(`Manifest should contain 40 unique WAVs; found ${manifestPaths.size}.`);
  for (const path of expectedPaths) if (!manifestPaths.has(path)) failures.push(`Manifest is missing ${path}.`);
  for (const entry of entries) {
    const expected = expectedMetadata.get(entry.file);
    if (!expected) {
      failures.push(`Manifest contains unexpected path ${entry.file}.`);
      continue;
    }
    if (entry.family !== expected.family.label) failures.push(`Manifest family is incorrect for ${entry.file}.`);
    if (entry.sample_rate !== 48_000 || entry.bit_depth !== 24 || entry.channels !== 2) {
      failures.push(`Manifest technical metadata is incorrect for ${entry.file}.`);
    }
  }
} catch (error) {
  failures.push(`Manifest could not be verified: ${error.message}`);
}

const measurements = [];
for (const file of wavFiles) {
  const name = relative(packRoot, file);
  const expected = expectedMetadata.get(name);
  const fileStat = await stat(file);
  let pcm;
  try {
    pcm = inspectPcm24(await readFile(file));
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    continue;
  }

  const probe = JSON.parse(
    run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,sample_rate,channels,bits_per_sample",
      "-show_entries",
      "format=size,duration",
      "-of",
      "json",
      file,
    ]),
  );
  const stream = probe.streams?.[0];
  const duration = Number(probe.format?.duration);
  if (stream?.codec_name !== "pcm_s24le") failures.push(`${name}: codec is ${stream?.codec_name}.`);
  if (Number(stream?.sample_rate) !== 48_000) failures.push(`${name}: sample rate is ${stream?.sample_rate}.`);
  if (Number(stream?.channels) !== 2) failures.push(`${name}: channel count is ${stream?.channels}.`);
  if (Number(stream?.bits_per_sample) !== 24) failures.push(`${name}: bit depth is ${stream?.bits_per_sample}.`);
  if (fileStat.size <= 44) failures.push(`${name}: file is empty or header-only.`);
  if (expected && (duration < expected.family.minimumDuration || duration > expected.family.maximumDuration)) {
    failures.push(`${name}: duration ${duration.toFixed(3)}s is outside its family contract.`);
  }
  if (Math.max(...Object.values(pcm.boundary).map(Math.abs)) > 0.000_000_2) {
    failures.push(`${name}: first or last sample is not zero-valued.`);
  }
  if (pcm.clipped_samples > 0) failures.push(`${name}: ${pcm.clipped_samples} full-scale samples detected.`);
  if (Math.max(Math.abs(pcm.dc_offset_left), Math.abs(pcm.dc_offset_right)) > 0.01) {
    failures.push(`${name}: excessive DC offset detected.`);
  }
  if (pcm.rms_dbfs == null || pcm.rms_dbfs < -50) failures.push(`${name}: file is effectively silent.`);
  if (pcm.final_5ms_peak_dbfs != null && pcm.final_5ms_peak_dbfs > -36) {
    failures.push(`${name}: final 5 ms remains too loud at ${pcm.final_5ms_peak_dbfs} dBFS.`);
  }
  if (pcm.stereo_correlation != null && pcm.stereo_correlation < 0.7) {
    failures.push(`${name}: stereo correlation ${pcm.stereo_correlation} is unsafe for a kick product.`);
  }
  if (pcm.low_band_side_to_mid_db != null && pcm.low_band_side_to_mid_db > -18) {
    failures.push(`${name}: low-band side energy is only ${pcm.low_band_side_to_mid_db} dB below the mid channel.`);
  }
  if (expected?.family.exactMono && pcm.maximum_stereo_difference > 0.000_000_12) {
    failures.push(`${name}: ${expected.family.label} kick is not sample-identical between channels.`);
  }

  const analysisProcess = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", file, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  if (analysisProcess.status !== 0) failures.push(`${name}: FFmpeg analysis failed.`);
  const analysis = analysisProcess.stderr ?? "";
  const peakMatches = [...analysis.matchAll(/True peak:\s+Peak:\s+(-?\d+(?:\.\d+)?) dBFS/g)];
  const loudnessMatches = [...analysis.matchAll(/Integrated loudness:\s+I:\s+(-?\d+(?:\.\d+)?) LUFS/g)];
  const truePeak = Number(peakMatches.at(-1)?.[1]);
  const measuredLufs = Number(loudnessMatches.at(-1)?.[1]);
  const integratedLufs = Number.isFinite(measuredLufs) && measuredLufs > -70 ? measuredLufs : null;
  if (!Number.isFinite(truePeak)) failures.push(`${name}: true peak could not be measured.`);
  if (truePeak > -1) failures.push(`${name}: true peak ${truePeak} dBTP exceeds the provisional -1 dBTP ceiling.`);

  measurements.push({
    file: name,
    bytes: fileStat.size,
    duration_seconds: Number(duration.toFixed(3)),
    codec: stream?.codec_name,
    sample_rate: Number(stream?.sample_rate),
    bit_depth: Number(stream?.bits_per_sample),
    channels: Number(stream?.channels),
    true_peak_dbtp: truePeak,
    integrated_lufs: integratedLufs,
    ...pcm,
  });
  console.log(
    `${name}: ${truePeak.toFixed(1)} dBTP, ${pcm.rms_dbfs.toFixed(1)} dBFS RMS, low side ${pcm.low_band_side_to_mid_db ?? "mono"} dB`,
  );
}

let humanApproval = {
  status: "UNVERIFIED",
  evidence: "No checksum-bound human approval was requested for this verification run.",
};
if (approvalRequested) {
  try {
    const approval = JSON.parse(await readFile(approvalPath, "utf8"));
    const [archiveSha256, reelSha256] = await Promise.all([sha256File(archivePath), sha256File(reelPath)]);
    const approvalFailures = [];
    if (approval.status !== "CONFIRMED") approvalFailures.push("Approval record is not CONFIRMED.");
    if (approval.customer_archive_sha256 !== archiveSha256) {
      approvalFailures.push("Customer archive checksum does not match the approved archive.");
    }
    if (approval.audition_reel_sha256 !== reelSha256) {
      approvalFailures.push("Audition reel checksum does not match the approved reel.");
    }
    failures.push(...approvalFailures);
    humanApproval = {
      ...approval,
      status: approvalFailures.length === 0 ? "CONFIRMED" : "BLOCKED",
      verified_customer_archive_sha256: archiveSha256,
      verified_audition_reel_sha256: reelSha256,
    };
  } catch (error) {
    failures.push(`Human approval could not be verified: ${error.message}`);
    humanApproval = { status: "BLOCKED", evidence: `Human approval could not be verified: ${error.message}` };
  }
}

const finitePeaks = measurements.filter((measurement) => Number.isFinite(measurement.true_peak_dbtp));
const ready = failures.length === 0 && archiveReopen && humanApproval.status === "CONFIRMED";
const verdict =
  failures.length > 0
    ? "BLOCKED — REQUIREMENTS OR MEDIA MISSING"
    : ready
      ? "READY — TECHNICAL QC PASSED"
      : "RENDERED — QC INCOMPLETE";
const reason =
  failures.length > 0
    ? "One or more technical, manifest or approval-integrity checks failed."
    : ready
      ? "The final ZIP was reopened, all automated technical checks passed, and Gabriel's checksum-bound listening approval was verified."
      : archiveReopen
        ? "The final ZIP was reopened and all automated technical checks passed; checksum-bound representative listening approval remains unverified."
        : humanApproval.status === "CONFIRMED"
          ? "Automated checks and checksum-bound listening approval passed; final archive reopen remains required."
          : "Automated technical checks passed; representative listening and final archive reopen are still required.";

const nonNullCorrelations = measurements
  .map((measurement) => measurement.stereo_correlation)
  .filter((value) => value != null);
const finiteLowSide = measurements
  .map((measurement) => measurement.low_band_side_to_mid_db)
  .filter(Number.isFinite);
const report = {
  verdict,
  reason,
  checked_at: new Date().toISOString(),
  source: packRoot,
  provisional_delivery_contract: {
    destination: "Gumroad and Bandcamp-ready Hologram People digital sample pack",
    expected_files: 40,
    format: "WAV PCM",
    sample_rate: 48_000,
    bit_depth: 24,
    channel_layout: "stereo with centred low-frequency foundation",
    provisional_true_peak_ceiling_dbtp: -1,
    maximum_low_band_side_to_mid_db: -18,
    categories: Object.fromEntries([...families].map(([name, family]) => [name, family.count])),
  },
  summary: {
    measured_files: measurements.length,
    total_duration_seconds: Number(
      measurements.reduce((sum, measurement) => sum + measurement.duration_seconds, 0).toFixed(3),
    ),
    true_peak_range_dbtp:
      finitePeaks.length > 0
        ? [
            Math.min(...finitePeaks.map((measurement) => measurement.true_peak_dbtp)),
            Math.max(...finitePeaks.map((measurement) => measurement.true_peak_dbtp)),
          ]
        : null,
    rms_range_dbfs:
      measurements.length > 0
        ? [
            Math.min(...measurements.map((measurement) => measurement.rms_dbfs)),
            Math.max(...measurements.map((measurement) => measurement.rms_dbfs)),
          ]
        : null,
    stereo_correlation_range:
      nonNullCorrelations.length > 0
        ? [Math.min(...nonNullCorrelations), Math.max(...nonNullCorrelations)]
        : null,
    low_band_side_to_mid_range_db:
      finiteLowSide.length > 0 ? [Math.min(...finiteLowSide), Math.max(...finiteLowSide)] : null,
  },
  human_approval: humanApproval,
  failures,
  measurements,
};

await mkdir(join(root, "qa"), { recursive: true });
const reportPath = join(root, "qa", archiveReopen ? "QA_REPORT_ARCHIVE.json" : "QA_REPORT.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${verdict}: ${reason}`);
console.log(`Report: ${reportPath}`);

if (failures.length > 0) {
  throw new Error(`Verification failed:\n- ${failures.join("\n- ")}`);
}
