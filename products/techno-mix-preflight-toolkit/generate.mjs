import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const packName = "Techno_Mix_Preflight_Toolkit_by_Hologram_People";
const outputRoot = join(root, "pack", packName);
const sampleRate = 48_000;
const duration = 8;
const fadeSeconds = 0.05;

function seededRandom(seed) {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function buffer(seconds = duration) {
  const length = Math.round(seconds * sampleRate);
  return { left: new Float64Array(length), right: new Float64Array(length) };
}

function edgeFade(audio) {
  const count = Math.round(fadeSeconds * sampleRate);
  for (let index = 0; index < audio.left.length; index += 1) {
    const gain = Math.min(1, index / count, (audio.left.length - 1 - index) / count);
    audio.left[index] *= Math.max(0, gain);
    audio.right[index] *= Math.max(0, gain);
  }
  audio.left[0] = 0;
  audio.right[0] = 0;
  audio.left[audio.left.length - 1] = 0;
  audio.right[audio.right.length - 1] = 0;
  return audio;
}

function activeChannelRms(audio) {
  let sumLeft = 0;
  let sumRight = 0;
  for (let index = 0; index < audio.left.length; index += 1) {
    sumLeft += audio.left[index] ** 2;
    sumRight += audio.right[index] ** 2;
  }
  const rmsLeft = Math.sqrt(sumLeft / audio.left.length);
  const rmsRight = Math.sqrt(sumRight / audio.right.length);
  const active = [rmsLeft, rmsRight].filter((value) => value > 1e-12);
  return active.reduce((sum, value) => sum + value, 0) / active.length;
}

function setRms(audio, dbfs) {
  const current = activeChannelRms(audio);
  const target = 10 ** (dbfs / 20);
  if (current > 0) {
    const gain = target / current;
    for (let index = 0; index < audio.left.length; index += 1) {
      audio.left[index] *= gain;
      audio.right[index] *= gain;
    }
  }
  return edgeFade(audio);
}

function sine(frequency, dbfs = -20, mode = "mono") {
  const audio = buffer();
  for (let index = 0; index < audio.left.length; index += 1) {
    const value = Math.sin(2 * Math.PI * frequency * index / sampleRate);
    audio.left[index] = mode === "right" ? 0 : value;
    audio.right[index] = mode === "left" ? 0 : mode === "opposite" ? -value : value;
  }
  return setRms(audio, dbfs);
}

function pink(seed, dbfs = -20, channel = "stereo") {
  const random = seededRandom(seed);
  const audio = buffer();
  const rowsL = new Float64Array(16);
  const rowsR = new Float64Array(16);
  let counter = 0;
  for (let index = 0; index < audio.left.length; index += 1) {
    counter += 1;
    let changed = counter;
    let row = 0;
    while ((changed & 1) === 0 && row < rowsL.length) {
      rowsL[row] = random() * 2 - 1;
      rowsR[row] = random() * 2 - 1;
      changed >>= 1;
      row += 1;
    }
    const left = rowsL.reduce((sum, value) => sum + value, 0) / rowsL.length;
    const right = rowsR.reduce((sum, value) => sum + value, 0) / rowsR.length;
    audio.left[index] = channel === "right" ? 0 : left;
    audio.right[index] = channel === "left" ? 0 : channel === "mono" ? left : right;
  }
  return setRms(audio, dbfs);
}

function bandNoise(seed, lowHz, highHz, dbfs = -24) {
  const random = seededRandom(seed);
  const audio = buffer();
  const lowAlpha = Math.exp(-2 * Math.PI * highHz / sampleRate);
  const highAlpha = Math.exp(-2 * Math.PI * lowHz / sampleRate);
  let lowL = 0, lowR = 0, highBaseL = 0, highBaseR = 0;
  for (let index = 0; index < audio.left.length; index += 1) {
    const inL = random() * 2 - 1;
    const inR = random() * 2 - 1;
    lowL = (1 - lowAlpha) * inL + lowAlpha * lowL;
    lowR = (1 - lowAlpha) * inR + lowAlpha * lowR;
    highBaseL = (1 - highAlpha) * lowL + highAlpha * highBaseL;
    highBaseR = (1 - highAlpha) * lowR + highAlpha * highBaseR;
    audio.left[index] = lowL - highBaseL;
    audio.right[index] = lowR - highBaseR;
  }
  return setRms(audio, dbfs);
}

function stereoWidth(seed, dbfs = -24) {
  const random = seededRandom(seed);
  const audio = buffer();
  for (let index = 0; index < audio.left.length; index += 1) {
    const common = random() * 2 - 1;
    const side = random() * 2 - 1;
    audio.left[index] = common * 0.5 + side * 0.5;
    audio.right[index] = common * 0.5 - side * 0.5;
  }
  return setRms(audio, dbfs);
}

function writeWav24(audio) {
  const bytesPerSample = 3;
  const channels = 2;
  const dataBytes = audio.left.length * channels * bytesPerSample;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + dataBytes, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  wav.writeUInt16LE(channels * bytesPerSample, 32); wav.writeUInt16LE(24, 34);
  wav.write("data", 36); wav.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let index = 0; index < audio.left.length; index += 1) {
    for (const sample of [audio.left[index], audio.right[index]]) {
      wav.writeIntLE(Math.round(Math.max(-1, Math.min(1, sample)) * 8_388_607), offset, 3);
      offset += 3;
    }
  }
  return wav;
}

const files = [
  ["01_Level_and_Meter", "TMP_1kHz_Sine_Minus20dBFS_RMS.wav", () => sine(1000), "1 kHz sine at -20 dBFS RMS"],
  ["01_Level_and_Meter", "TMP_Pink_Noise_Mono_Minus20dBFS_RMS.wav", () => pink("mono-level", -20, "mono"), "correlated mono pink noise at -20 dBFS RMS"],
  ["01_Level_and_Meter", "TMP_Pink_Noise_Stereo_Minus20dBFS_RMS.wav", () => pink("stereo-level"), "uncorrelated stereo pink noise at -20 dBFS RMS"],
  ["01_Level_and_Meter", "TMP_1kHz_Sine_Minus30dBFS_RMS.wav", () => sine(1000, -30), "quiet 1 kHz sine at -30 dBFS RMS"],
  ...[30, 35, 40, 45, 50, 55, 60, 70, 80, 100].map((hz) => ["02_Low_End_Audibility", `TMP_Low_End_${hz}Hz_Minus20dBFS_RMS.wav`, () => sine(hz), `${hz} Hz sine at -20 dBFS RMS`]),
  ["03_Stereo_Mono_and_Polarity", "TMP_Left_Only_Pink_Minus24dBFS_RMS.wav", () => pink("left", -24, "left"), "left-channel-only routing check"],
  ["03_Stereo_Mono_and_Polarity", "TMP_Right_Only_Pink_Minus24dBFS_RMS.wav", () => pink("right", -24, "right"), "right-channel-only routing check"],
  ["03_Stereo_Mono_and_Polarity", "TMP_Mono_Centre_Pink_Minus24dBFS_RMS.wav", () => pink("centre", -24, "mono"), "correlated mono centre check"],
  ["03_Stereo_Mono_and_Polarity", "TMP_Stereo_Width_Noise_Minus24dBFS_RMS.wav", () => stereoWidth("width"), "mixed correlated and anti-correlated stereo information"],
  ["03_Stereo_Mono_and_Polarity", "TMP_100Hz_In_Phase_Minus20dBFS_RMS.wav", () => sine(100), "in-phase stereo low-frequency check"],
  ["03_Stereo_Mono_and_Polarity", "TMP_100Hz_INTENTIONAL_OUT_OF_PHASE_Minus20dBFS_RMS.wav", () => sine(100, -20, "opposite"), "intentional opposite-polarity stereo signal; cancels when summed to mono"],
  ["04_Frequency_Focus", "TMP_Focus_Sub_25-80Hz_Minus24dBFS_RMS.wav", () => bandNoise("sub", 25, 80), "approximately 25-80 Hz band-focused noise"],
  ["04_Frequency_Focus", "TMP_Focus_LowMid_80-300Hz_Minus24dBFS_RMS.wav", () => bandNoise("lowmid", 80, 300), "approximately 80-300 Hz band-focused noise"],
  ["04_Frequency_Focus", "TMP_Focus_Mid_300-3000Hz_Minus24dBFS_RMS.wav", () => bandNoise("mid", 300, 3000), "approximately 300-3000 Hz band-focused noise"],
  ["04_Frequency_Focus", "TMP_Focus_High_3000-16000Hz_Minus24dBFS_RMS.wav", () => bandNoise("high", 3000, 16000), "approximately 3000-16000 Hz band-focused noise"],
];

const manifest = [];
for (const [folder, filename, render, purpose] of files) {
  await mkdir(join(outputRoot, folder), { recursive: true });
  await writeFile(join(outputRoot, folder, filename), writeWav24(render()));
  manifest.push({ file: `${folder}/${filename}`, purpose, sample_rate: sampleRate, bit_depth: 24, channels: 2, duration_seconds: duration });
}
await copyFile(join(root, "README.txt"), join(outputRoot, "README.txt"));
await copyFile(join(root, "LICENSE.txt"), join(outputRoot, "LICENSE.txt"));
await copyFile(join(root, "PREFLIGHT_CHECKLIST.txt"), join(outputRoot, "PREFLIGHT_CHECKLIST.txt"));
await writeFile(join(outputRoot, "MANIFEST.json"), `${JSON.stringify({ product: "Techno Mix Preflight Toolkit", creator: "Hologram People / Gabriel Garcia Alonso", files: manifest }, null, 2)}\n`);
console.log(`Rendered ${manifest.length} diagnostic WAV files to ${outputRoot}`);
