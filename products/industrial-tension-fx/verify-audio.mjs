import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const archiveReopen = Boolean(process.argv[2]);
const packRoot = process.argv[2]
  ? resolve(process.argv[2])
  : join(root, "pack", "Industrial_Tension_FX_by_Hologram_People");
const reportRoot = join(root, "qa");
const expectedFolders = new Map([
  ["01_Impacts", 10],
  ["02_Risers", 10],
  ["03_Downlifters", 10],
  ["04_Drones", 8],
  ["05_Noise_Sweeps", 10],
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    throw new Error(`${command} failed:\n${output}`);
  }
}

function inspectBoundarySamples(wav) {
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Invalid RIFF/WAVE header.");
  }
  const dataOffset = wav.indexOf(Buffer.from("data"));
  if (dataOffset < 0) throw new Error("Missing WAV data chunk.");
  const start = dataOffset + 8;
  const dataBytes = wav.readUInt32LE(dataOffset + 4);
  const end = start + dataBytes;
  const read24 = (offset) => wav.readIntLE(offset, 3) / 8_388_608;
  return {
    first_left: read24(start),
    first_right: read24(start + 3),
    last_left: read24(end - 6),
    last_right: read24(end - 3),
  };
}

const wavFiles = (await walk(packRoot)).filter((file) => extname(file).toLowerCase() === ".wav").sort();
const failures = [];
const measurements = [];

if (wavFiles.length !== 48) failures.push(`Expected 48 WAV files; found ${wavFiles.length}.`);
for (const [folder, expected] of expectedFolders) {
  const actual = wavFiles.filter((file) => relative(packRoot, file).startsWith(`${folder}/`)).length;
  if (actual !== expected) failures.push(`${folder}: expected ${expected} files; found ${actual}.`);
}

for (const file of wavFiles) {
  const relativePath = relative(packRoot, file);
  const probe = JSON.parse(
    run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,sample_rate,channels,bits_per_sample,duration",
      "-show_entries",
      "format=size,duration",
      "-of",
      "json",
      file,
    ]),
  );
  const stream = probe.streams?.[0];
  const fileStat = await stat(file);
  if (!stream) failures.push(`${relativePath}: no audio stream.`);
  if (stream?.codec_name !== "pcm_s24le") failures.push(`${relativePath}: codec is ${stream?.codec_name}.`);
  if (Number(stream?.sample_rate) !== 48_000) failures.push(`${relativePath}: sample rate is ${stream?.sample_rate}.`);
  if (Number(stream?.channels) !== 2) failures.push(`${relativePath}: channel count is ${stream?.channels}.`);
  if (Number(stream?.bits_per_sample) !== 24) failures.push(`${relativePath}: bit depth is ${stream?.bits_per_sample}.`);
  if (fileStat.size <= 44) failures.push(`${relativePath}: file is empty or header-only.`);

  const boundary = inspectBoundarySamples(await readFile(file));
  if (Math.max(...Object.values(boundary).map(Math.abs)) > 0.000_001) {
    failures.push(`${relativePath}: first or last sample is not faded to zero.`);
  }

  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", file, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) failures.push(`${relativePath}: FFmpeg analysis failed.`);
  const analysis = result.stderr ?? "";

  const truePeakMatches = [...analysis.matchAll(/True peak:\s+Peak:\s+(-?\d+(?:\.\d+)?) dBFS/g)];
  const loudnessMatches = [...analysis.matchAll(/Integrated loudness:\s+I:\s+(-?\d+(?:\.\d+)?) LUFS/g)];
  const truePeakDbfs = Number(truePeakMatches.at(-1)?.[1]);
  const integratedLufs = Number(loudnessMatches.at(-1)?.[1]);
  if (!Number.isFinite(truePeakDbfs)) failures.push(`${relativePath}: true peak could not be measured.`);
  if (truePeakDbfs > -1) failures.push(`${relativePath}: true peak ${truePeakDbfs} dBFS exceeds -1 dBFS.`);

  measurements.push({
    file: relativePath,
    bytes: fileStat.size,
    duration_seconds: Number(Number(probe.format?.duration).toFixed(3)),
    codec: stream?.codec_name,
    sample_rate: Number(stream?.sample_rate),
    bit_depth: Number(stream?.bits_per_sample),
    channels: Number(stream?.channels),
    true_peak_dbfs: truePeakDbfs,
    integrated_lufs: integratedLufs,
    boundary,
  });
  console.log(`${relativePath}: ${truePeakDbfs.toFixed(1)} dBTP, ${integratedLufs.toFixed(1)} LUFS`);
}

await mkdir(reportRoot, { recursive: true });
const report = {
  verdict:
    failures.length === 0
      ? archiveReopen
        ? "ARCHIVE VERIFIED — LISTENING REQUIRED"
        : "RENDERED — QC INCOMPLETE"
      : "BLOCKED — REQUIREMENTS OR MEDIA MISSING",
  reason:
    failures.length === 0
      ? archiveReopen
        ? "The final ZIP was reopened and all automated technical checks passed; representative critical listening is still required."
        : "Automated technical checks passed; representative critical listening and final archive reopen are still required."
      : "One or more automated technical checks failed.",
  checked_at: new Date().toISOString(),
  provisional_delivery_contract: {
    destination: "Gumroad and Bandcamp-ready digital sample pack",
    format: "WAV PCM",
    sample_rate: 48_000,
    bit_depth: 24,
    channel_layout: "stereo",
    true_peak_ceiling_dbfs: -1,
    expected_files: 48,
  },
  failures,
  measurements,
};
const reportFilename = archiveReopen ? "QA_REPORT_ARCHIVE.json" : "QA_REPORT.json";
await writeFile(join(reportRoot, reportFilename), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    archiveReopen
      ? `Archive reopen QA passed for ${measurements.length} files. Representative listening remains.`
      : `Automated QA passed for ${measurements.length} files. Listening and archive checks remain.`,
  );
}
