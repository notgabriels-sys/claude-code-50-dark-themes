import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const archiveReopen = Boolean(process.argv[2]);
const packRoot = process.argv[2] ? resolve(process.argv[2]) : join(root, "pack", "Techno_Mix_Preflight_Toolkit_by_Hologram_People");
const expectedFolders = new Map([
  ["01_Level_and_Meter", 4],
  ["02_Low_End_Audibility", 10],
  ["03_Stereo_Mono_and_Polarity", 6],
  ["04_Frequency_Focus", 4],
]);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    files.push(...(entry.isDirectory() ? await walk(path) : [path]));
  }
  return files;
}

function parseWav(data) {
  if (data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WAVE") throw new Error("Invalid WAV header");
  const fmt = data.indexOf(Buffer.from("fmt "));
  const pcm = data.indexOf(Buffer.from("data"));
  if (fmt < 0 || pcm < 0) throw new Error("Missing WAV chunks");
  const channels = data.readUInt16LE(fmt + 10);
  const sampleRate = data.readUInt32LE(fmt + 12);
  const bitDepth = data.readUInt16LE(fmt + 22);
  const start = pcm + 8;
  const bytes = data.readUInt32LE(pcm + 4);
  const frames = bytes / (channels * 3);
  let sumL = 0, sumR = 0, cross = 0, peak = 0;
  let firstL = 0, firstR = 0, lastL = 0, lastR = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = start + frame * 6;
    const left = data.readIntLE(offset, 3) / 8_388_607;
    const right = data.readIntLE(offset + 3, 3) / 8_388_607;
    if (frame === 0) [firstL, firstR] = [left, right];
    if (frame === frames - 1) [lastL, lastR] = [left, right];
    sumL += left * left; sumR += right * right; cross += left * right;
    peak = Math.max(peak, Math.abs(left), Math.abs(right));
  }
  const rmsL = Math.sqrt(sumL / frames);
  const rmsR = Math.sqrt(sumR / frames);
  const correlation = sumL && sumR ? cross / Math.sqrt(sumL * sumR) : null;
  return { channels, sampleRate, bitDepth, frames, duration: frames / sampleRate, rmsL, rmsR, correlation, peak, boundaries: [firstL, firstR, lastL, lastR] };
}

const wavFiles = (await walk(packRoot)).filter((file) => extname(file).toLowerCase() === ".wav").sort();
const failures = [];
const measurements = [];
if (wavFiles.length !== 24) failures.push(`Expected 24 WAV files; found ${wavFiles.length}.`);
for (const [folder, expected] of expectedFolders) {
  const count = wavFiles.filter((file) => relative(packRoot, file).startsWith(`${folder}/`)).length;
  if (count !== expected) failures.push(`${folder}: expected ${expected}; found ${count}.`);
}

for (const file of wavFiles) {
  const name = relative(packRoot, file);
  const fileStat = await stat(file);
  const parsed = parseWav(await readFile(file));
  const db = (value) => value > 0 ? 20 * Math.log10(value) : -Infinity;
  const rmsLeft = db(parsed.rmsL);
  const rmsRight = db(parsed.rmsR);
  const peakDbfs = db(parsed.peak);
  const target = name.includes("Minus30dBFS") ? -30 : name.includes("Minus24dBFS") ? -24 : -20;
  const activeLevels = [rmsLeft, rmsRight].filter(Number.isFinite);
  if (parsed.channels !== 2) failures.push(`${name}: expected stereo.`);
  if (parsed.sampleRate !== 48_000) failures.push(`${name}: sample rate ${parsed.sampleRate}.`);
  if (parsed.bitDepth !== 24) failures.push(`${name}: bit depth ${parsed.bitDepth}.`);
  if (Math.abs(parsed.duration - 8) > 0.001) failures.push(`${name}: duration ${parsed.duration}.`);
  if (fileStat.size <= 44) failures.push(`${name}: empty or header-only.`);
  if (parsed.boundaries.some((value) => value !== 0)) failures.push(`${name}: non-zero boundary sample.`);
  if (activeLevels.some((level) => Math.abs(level - target) > 0.15)) failures.push(`${name}: active-channel RMS ${activeLevels.map((level) => level.toFixed(2)).join("/")} dBFS; expected ${target} dBFS.`);
  if (peakDbfs > -3) failures.push(`${name}: peak ${peakDbfs.toFixed(2)} dBFS is too close to full scale.`);
  if (name.includes("Left_Only") && Number.isFinite(rmsRight)) failures.push(`${name}: right channel is not silent.`);
  if (name.includes("Right_Only") && Number.isFinite(rmsLeft)) failures.push(`${name}: left channel is not silent.`);
  if ((name.includes("Mono_Centre") || name.includes("In_Phase")) && parsed.correlation < 0.999) failures.push(`${name}: expected correlated channels.`);
  if (name.includes("OUT_OF_PHASE") && parsed.correlation > -0.999) failures.push(`${name}: expected opposite-polarity channels.`);
  measurements.push({ file: name, bytes: fileStat.size, duration_seconds: parsed.duration, rms_left_dbfs: Number.isFinite(rmsLeft) ? Number(rmsLeft.toFixed(2)) : null, rms_right_dbfs: Number.isFinite(rmsRight) ? Number(rmsRight.toFixed(2)) : null, peak_dbfs: Number(peakDbfs.toFixed(2)), correlation: parsed.correlation === null ? null : Number(parsed.correlation.toFixed(4)) });
  console.log(`${name}: RMS ${Number.isFinite(rmsLeft) ? rmsLeft.toFixed(1) : "silent"}/${Number.isFinite(rmsRight) ? rmsRight.toFixed(1) : "silent"} dBFS, peak ${peakDbfs.toFixed(1)} dBFS`);
}

await mkdir(join(root, "qa"), { recursive: true });
const verdict = failures.length ? "BLOCKED — REQUIREMENTS OR MEDIA MISSING" : archiveReopen ? "ARCHIVE VERIFIED — PRACTICAL USAGE PASS REQUIRED" : "RENDERED — QC INCOMPLETE";
await writeFile(join(root, "qa", "QA_REPORT.json"), `${JSON.stringify({ verdict, checked_at: new Date().toISOString(), source: packRoot, failures, measurements }, null, 2)}\n`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(archiveReopen ? "Archive reopen QA passed. Practical DAW usage pass remains." : "Automated audio QA passed. PDF, archive and practical usage checks remain.");
}
