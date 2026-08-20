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
  : join(root, "pack", "Hypnotic_Percussion_Grid_by_Hologram_People");
const approvalPath = join(root, "AUDIO_APPROVAL.json");
const archivePath = join(root, "dist", "Hypnotic_Percussion_Grid_by_Hologram_People.zip");
const reelPath = join(root, "qa", "HPG_Audition_Reel.mp3");
const families = new Map([
  ["01_Closed_Hats", { count: 16, stem: "HPG_Closed_Hat" }],
  ["02_Metallic_Percussion", { count: 16, stem: "HPG_Metallic_Perc" }],
  ["03_Dry_Clicks_and_Ticks", { count: 16, stem: "HPG_Dry_Click" }],
  ["04_Shakers_and_Noise", { count: 16, stem: "HPG_Shaker_Noise" }],
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
  if (dataEnd > wav.length || dataBytes % 6 !== 0) throw new Error("Truncated or misaligned stereo PCM data.");

  const frames = dataBytes / 6;
  if (frames === 0) throw new Error("WAV contains no audio frames.");
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
  const tailStart = Math.max(0, frames - 240);

  for (let frame = 0; frame < frames; frame += 1) {
    const offset = dataStart + frame * 6;
    const left = wav.readIntLE(offset, 3) / 8_388_608;
    const right = wav.readIntLE(offset + 3, 3) / 8_388_608;
    const peak = Math.max(Math.abs(left), Math.abs(right));
    const mid = (left + right) * 0.5;
    const side = (left - right) * 0.5;
    if (frame === 0) Object.assign(boundary, { first_left: left, first_right: right });
    if (frame === frames - 1) Object.assign(boundary, { last_left: left, last_right: right });
    samplePeak = Math.max(samplePeak, peak);
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

  return {
    frame_count: frames,
    sample_peak_dbfs: toDbfs(samplePeak),
    rms_dbfs: toDbfs(stereoRms),
    mid_rms_dbfs: toDbfs(midRms),
    side_rms_dbfs: toDbfs(Math.sqrt(squareSide / frames)),
    dc_offset_left: Number(meanLeft.toFixed(8)),
    dc_offset_right: Number(meanRight.toFixed(8)),
    stereo_correlation:
      correlationDenominator > 0 ? Number((covariance / correlationDenominator).toFixed(6)) : null,
    clipped_samples: clippedSamples,
    final_5ms_peak_dbfs: toDbfs(tailPeak),
    boundary,
  };
}

const failures = [];
let allFiles = [];
try {
  allFiles = await walk(packRoot);
} catch (error) {
  failures.push(`Pack root could not be read: ${error.message}`);
}
const wavFiles = allFiles.filter((file) => extname(file).toLowerCase() === ".wav").sort();
const expectedPaths = [];
for (const [folder, family] of families) {
  for (let index = 1; index <= family.count; index += 1) {
    expectedPaths.push(`${folder}/${family.stem}_${String(index).padStart(2, "0")}.wav`);
  }
}
const expectedSet = new Set(expectedPaths);
const actualPaths = wavFiles.map((file) => relative(packRoot, file));
const actualSet = new Set(actualPaths);
for (const path of expectedPaths) if (!actualSet.has(path)) failures.push(`Missing expected WAV: ${path}.`);
for (const path of actualPaths) if (!expectedSet.has(path)) failures.push(`Unexpected WAV: ${path}.`);
if (wavFiles.length !== 64) failures.push(`Expected 64 WAV files; found ${wavFiles.length}.`);

for (const name of ["README.txt", "LICENSE.txt", "MANIFEST.json"]) {
  try {
    if ((await stat(join(packRoot, name))).size === 0) failures.push(`${name} is empty.`);
  } catch (error) {
    failures.push(`${name} is missing or unreadable: ${error.message}`);
  }
}

try {
  const manifest = JSON.parse(await readFile(join(packRoot, "MANIFEST.json"), "utf8"));
  const manifestPaths = new Set((manifest.files ?? []).map((entry) => entry.file));
  if (manifest.product !== "Hypnotic Percussion Grid") failures.push("Manifest product identity is incorrect.");
  if (manifest.artist !== "Hologram People") failures.push("Manifest artist identity is incorrect.");
  if (manifestPaths.size !== 64) failures.push(`Manifest should contain 64 unique WAVs; found ${manifestPaths.size}.`);
  for (const path of expectedPaths) if (!manifestPaths.has(path)) failures.push(`Manifest is missing ${path}.`);
  for (const entry of manifest.files ?? []) {
    if (!expectedSet.has(entry.file)) failures.push(`Manifest contains unexpected path ${entry.file}.`);
    if (entry.sample_rate !== 48_000 || entry.bit_depth !== 24 || entry.channels !== 2) {
      failures.push(`Manifest technical metadata is incorrect for ${entry.file}.`);
    }
    if (entry.family !== entry.file?.split("/")[0]) failures.push(`Manifest family is incorrect for ${entry.file}.`);
  }
} catch (error) {
  failures.push(`Manifest could not be verified: ${error.message}`);
}

const measurements = [];
for (const file of wavFiles) {
  const name = relative(packRoot, file);
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
  if (stream?.codec_name !== "pcm_s24le") failures.push(`${name}: codec is ${stream?.codec_name}.`);
  if (Number(stream?.sample_rate) !== 48_000) failures.push(`${name}: sample rate is ${stream?.sample_rate}.`);
  if (Number(stream?.channels) !== 2) failures.push(`${name}: channel count is ${stream?.channels}.`);
  if (Number(stream?.bits_per_sample) !== 24) failures.push(`${name}: bit depth is ${stream?.bits_per_sample}.`);
  if (fileStat.size <= 44) failures.push(`${name}: file is empty or header-only.`);
  if (Math.max(...Object.values(pcm.boundary).map(Math.abs)) > 0.000_001) {
    failures.push(`${name}: first or last sample is not faded to zero.`);
  }
  if (pcm.clipped_samples > 0) failures.push(`${name}: ${pcm.clipped_samples} full-scale samples detected.`);
  if (Math.max(Math.abs(pcm.dc_offset_left), Math.abs(pcm.dc_offset_right)) > 0.01) {
    failures.push(`${name}: excessive DC offset detected.`);
  }
  if (pcm.rms_dbfs == null || pcm.rms_dbfs < -90) failures.push(`${name}: file is effectively silent.`);
  if (
    pcm.stereo_correlation != null &&
    pcm.stereo_correlation < -0.95 &&
    pcm.mid_rms_dbfs != null &&
    pcm.rms_dbfs != null &&
    pcm.mid_rms_dbfs < pcm.rms_dbfs - 12
  ) {
    failures.push(`${name}: severe anti-phase mono cancellation detected.`);
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
    duration_seconds: Number(Number(probe.format?.duration).toFixed(3)),
    codec: stream?.codec_name,
    sample_rate: Number(stream?.sample_rate),
    bit_depth: Number(stream?.bits_per_sample),
    channels: Number(stream?.channels),
    true_peak_dbtp: truePeak,
    integrated_lufs: integratedLufs,
    loudness_note:
      integratedLufs == null
        ? "Below the EBU R128 integration gate for this short one-shot; RMS is reported instead."
        : null,
    ...pcm,
  });
  console.log(`${name}: ${truePeak.toFixed(1)} dBTP, ${pcm.rms_dbfs.toFixed(1)} dBFS RMS`);
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

const report = {
  verdict,
  reason,
  checked_at: new Date().toISOString(),
  source: packRoot,
  provisional_delivery_contract: {
    destination: "Gumroad and Bandcamp-ready Hologram People digital sample pack",
    expected_files: 64,
    format: "WAV PCM",
    sample_rate: 48_000,
    bit_depth: 24,
    channel_layout: "stereo",
    provisional_true_peak_ceiling_dbtp: -1,
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
    full_scale_samples: measurements.reduce((sum, measurement) => sum + measurement.clipped_samples, 0),
  },
  human_approval: humanApproval,
  failures,
  measurements,
};

await mkdir(join(root, "qa"), { recursive: true });
await writeFile(
  join(root, "qa", archiveReopen ? "QA_REPORT_ARCHIVE.json" : "QA_REPORT.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    ready
      ? `Archive reopen QA and checksum-bound human approval passed for ${measurements.length} files.`
      : archiveReopen
        ? `Archive reopen QA passed for ${measurements.length} files. Checksum-bound listening approval remains.`
        : humanApproval.status === "CONFIRMED"
          ? `Automated QA and checksum-bound listening approval passed for ${measurements.length} files. Archive reopen remains.`
          : `Automated QA passed for ${measurements.length} files. Listening and archive checks remain.`,
  );
}
