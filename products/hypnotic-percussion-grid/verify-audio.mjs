import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const archiveReopen = Boolean(process.argv[2]);
const packRoot = process.argv[2] ? resolve(process.argv[2]) : join(root, "pack", "Hypnotic_Percussion_Grid_by_Hologram_People");
const expectedFolders = new Map([
  ["01_Closed_Hats", 16],
  ["02_Metallic_Percussion", 16],
  ["03_Dry_Clicks_and_Ticks", 16],
  ["04_Shakers_and_Noise", 16],
]);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    files.push(...(entry.isDirectory() ? await walk(path) : [path]));
  }
  return files;
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function boundarySamples(wav) {
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") throw new Error("Invalid WAV header");
  const marker = wav.indexOf(Buffer.from("data"));
  if (marker < 0) throw new Error("Missing data chunk");
  const start = marker + 8;
  const end = start + wav.readUInt32LE(marker + 4);
  return [wav.readIntLE(start, 3), wav.readIntLE(start + 3, 3), wav.readIntLE(end - 6, 3), wav.readIntLE(end - 3, 3)];
}

const wavFiles = (await walk(packRoot)).filter((file) => extname(file).toLowerCase() === ".wav").sort();
const failures = [];
const measurements = [];
if (wavFiles.length !== 64) failures.push(`Expected 64 WAV files; found ${wavFiles.length}.`);
for (const [folder, expected] of expectedFolders) {
  const count = wavFiles.filter((file) => relative(packRoot, file).startsWith(`${folder}/`)).length;
  if (count !== expected) failures.push(`${folder}: expected ${expected}; found ${count}.`);
}

for (const file of wavFiles) {
  const name = relative(packRoot, file);
  const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,sample_rate,channels,bits_per_sample", "-show_entries", "format=size,duration", "-of", "json", file]));
  const stream = probe.streams?.[0];
  const fileStat = await stat(file);
  if (stream?.codec_name !== "pcm_s24le") failures.push(`${name}: codec ${stream?.codec_name}.`);
  if (Number(stream?.sample_rate) !== 48_000) failures.push(`${name}: sample rate ${stream?.sample_rate}.`);
  if (Number(stream?.channels) !== 2) failures.push(`${name}: channels ${stream?.channels}.`);
  if (Number(stream?.bits_per_sample) !== 24) failures.push(`${name}: bit depth ${stream?.bits_per_sample}.`);
  if (fileStat.size <= 44) failures.push(`${name}: empty or header-only.`);
  if (boundarySamples(await readFile(file)).some((value) => value !== 0)) failures.push(`${name}: non-zero boundary sample.`);

  const result = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`${name}: FFmpeg analysis failed.`);
  const analysis = result.stderr ?? "";
  const peakMatches = [...analysis.matchAll(/True peak:\s+Peak:\s+(-?\d+(?:\.\d+)?) dBFS/g)];
  const loudnessMatches = [...analysis.matchAll(/Integrated loudness:\s+I:\s+(-?\d+(?:\.\d+)?) LUFS/g)];
  const truePeak = Number(peakMatches.at(-1)?.[1]);
  const loudness = Number(loudnessMatches.at(-1)?.[1]);
  if (!Number.isFinite(truePeak)) failures.push(`${name}: true peak unavailable.`);
  if (truePeak > -1) failures.push(`${name}: true peak ${truePeak} dBTP exceeds provisional -1 dBTP ceiling.`);
  measurements.push({ file: name, bytes: fileStat.size, duration_seconds: Number(Number(probe.format?.duration).toFixed(3)), true_peak_dbtp: truePeak, integrated_lufs: loudness });
  console.log(`${name}: ${truePeak.toFixed(1)} dBTP, ${loudness.toFixed(1)} LUFS`);
}

await mkdir(join(root, "qa"), { recursive: true });
const verdict = failures.length ? "BLOCKED — REQUIREMENTS OR MEDIA MISSING" : archiveReopen ? "ARCHIVE VERIFIED — LISTENING REQUIRED" : "RENDERED — QC INCOMPLETE";
await writeFile(join(root, "qa", "QA_REPORT.json"), `${JSON.stringify({ verdict, checked_at: new Date().toISOString(), provisional_true_peak_ceiling_dbtp: -1, source: packRoot, failures, measurements }, null, 2)}\n`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(archiveReopen ? "Archive reopen QA passed for 64 files. Representative listening remains." : "Automated QA passed for 64 files. Listening and archive checks remain.");
}
