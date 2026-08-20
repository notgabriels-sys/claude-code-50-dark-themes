import { execFileSync } from "node:child_process";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const packName = "Techno_Low_End_Architecture_by_Hologram_People";
const outputRoot = join(root, "pack", packName);
const qaRoot = join(root, "qa");
const sampleRate = 48_000;
const bitDepth = 24;
const channels = 2;

const notes = [
  ["C1", 32.7032],
  ["Db1", 34.6478],
  ["D1", 36.7081],
  ["Eb1", 38.8909],
  ["E1", 41.2034],
  ["F1", 43.6535],
  ["Gb1", 46.2493],
  ["G1", 48.9994],
  ["Ab1", 51.9131],
  ["A1", 55],
  ["Bb1", 58.2705],
  ["B1", 61.7354],
];

function hash(text) {
  let value = 2166136261;
  for (const character of text) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function randomFrom(seedText) {
  let state = hash(seedText) || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createBuffer(seconds) {
  const length = Math.round(seconds * sampleRate);
  return { left: new Float64Array(length), right: new Float64Array(length) };
}

function smoothstep(value) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

function softClip(value, drive = 1.8) {
  return Math.tanh(value * drive) / Math.tanh(drive);
}

function dcBlock(data, coefficient = 0.99935) {
  let previousInput = 0;
  let previousOutput = 0;
  for (let index = 0; index < data.length; index += 1) {
    const input = data[index];
    const output = input - previousInput + coefficient * previousOutput;
    data[index] = output;
    previousInput = input;
    previousOutput = output;
  }
}

function finalise(buffer, { peakTarget, fadeInSeconds, fadeOutSeconds }) {
  dcBlock(buffer.left);
  dcBlock(buffer.right);
  const fadeIn = Math.max(8, Math.round(fadeInSeconds * sampleRate));
  const fadeOut = Math.max(32, Math.round(fadeOutSeconds * sampleRate));
  let peak = 0;

  for (let index = 0; index < buffer.left.length; index += 1) {
    const inGain = index < fadeIn ? smoothstep(index / fadeIn) : 1;
    const framesRemaining = buffer.left.length - 1 - index;
    const outGain = framesRemaining < fadeOut ? smoothstep(framesRemaining / fadeOut) : 1;
    buffer.left[index] *= inGain * outGain;
    buffer.right[index] *= inGain * outGain;
    peak = Math.max(peak, Math.abs(buffer.left[index]), Math.abs(buffer.right[index]));
  }

  const gain = peak > 0 ? peakTarget / peak : 1;
  let sumSquares = 0;
  let finalPeak = 0;
  for (let index = 0; index < buffer.left.length; index += 1) {
    buffer.left[index] *= gain;
    buffer.right[index] *= gain;
    finalPeak = Math.max(finalPeak, Math.abs(buffer.left[index]), Math.abs(buffer.right[index]));
    sumSquares += buffer.left[index] ** 2 + buffer.right[index] ** 2;
  }

  buffer.left[0] = 0;
  buffer.right[0] = 0;
  buffer.left[buffer.left.length - 1] = 0;
  buffer.right[buffer.right.length - 1] = 0;

  return {
    buffer,
    samplePeakDbfs: Number((20 * Math.log10(finalPeak || Number.MIN_VALUE)).toFixed(3)),
    rmsDbfs: Number(
      (20 * Math.log10(Math.sqrt(sumSquares / (buffer.left.length * 2)) || Number.MIN_VALUE)).toFixed(3),
    ),
  };
}

function subPulse(seed, noteFrequency, variant) {
  const random = randomFrom(seed);
  const duration = 1.08 + (variant % 4) * 0.13;
  const buffer = createBuffer(duration);
  let phase = 0;
  for (let index = 0; index < buffer.left.length; index += 1) {
    const time = index / sampleRate;
    const pitchEnvelope = 1 + (0.62 + random() * 0.002) * Math.exp(-time / (0.018 + (variant % 3) * 0.004));
    phase += (2 * Math.PI * noteFrequency * pitchEnvelope) / sampleRate;
    const attack = smoothstep(Math.min(1, time / 0.004));
    const decay = Math.exp(-time / (0.34 + variant * 0.027));
    const fundamental = Math.sin(phase);
    const second = Math.sin(phase * 2 + 0.17) * 0.075 * Math.exp(-time / 0.19);
    const sample = softClip((fundamental * 0.92 + second) * attack * decay, 1.24);
    buffer.left[index] = sample;
    buffer.right[index] = sample;
  }
  return finalise(buffer, { peakTarget: 0.44, fadeInSeconds: 0.0005, fadeOutSeconds: 0.06 });
}

function saturatedStab(seed, noteFrequency, variant) {
  const random = randomFrom(seed);
  const duration = 1.28 + (variant % 5) * 0.14;
  const buffer = createBuffer(duration);
  let phase = 0;
  let noiseState = 0;
  for (let index = 0; index < buffer.left.length; index += 1) {
    const time = index / sampleRate;
    const pitchEnvelope = 1 + 0.22 * Math.exp(-time / (0.026 + (variant % 4) * 0.003));
    phase += (2 * Math.PI * noteFrequency * pitchEnvelope) / sampleRate;
    const attack = smoothstep(Math.min(1, time / (0.005 + (variant % 3) * 0.0015)));
    const decay = Math.exp(-time / (0.42 + variant * 0.018));
    let body = 0;
    for (let harmonic = 1; harmonic <= 8; harmonic += 1) {
      const brightness = Math.exp(-time * (0.48 + harmonic * 0.15));
      body += Math.sin(phase * harmonic + harmonic * 0.19) * brightness / harmonic;
    }
    const white = random() * 2 - 1;
    const coefficient = 1 - Math.exp((-2 * Math.PI * (720 + variant * 31)) / sampleRate);
    noiseState += coefficient * (white - noiseState);
    const upperNoise = white - noiseState;
    const upperPartial = Math.sin(phase * (7 + (variant % 3)) + Math.sin(time * 19) * 0.4);
    const side = (upperNoise * 0.04 + upperPartial * 0.055) * decay * Math.exp(-time / 0.34);
    const mono = softClip(body * attack * decay * 0.72 + noiseState * attack * decay * 0.045, 2.15);
    buffer.left[index] = mono + side;
    buffer.right[index] = mono - side;
  }
  return finalise(buffer, { peakTarget: 0.55, fadeInSeconds: 0.001, fadeOutSeconds: 0.075 });
}

function rumbleTail(seed, noteFrequency, variant) {
  const random = randomFrom(seed);
  const duration = 3.1 + (variant % 4) * 0.34;
  const buffer = createBuffer(duration);
  const phases = [0, 0, 0, 0];
  const ratios = [1, 1.487, 2.013, 3.129];
  let lowNoise = 0;
  let sideLowLeft = 0;
  let sideLowRight = 0;

  for (let index = 0; index < buffer.left.length; index += 1) {
    const time = index / sampleRate;
    const attack = smoothstep(Math.min(1, time / (0.026 + (variant % 3) * 0.006)));
    const decay = Math.exp(-time / (1.05 + variant * 0.055));
    let resonant = 0;
    for (let mode = 0; mode < ratios.length; mode += 1) {
      const frequency = noteFrequency * ratios[mode] * (1 + Math.sin(time * (0.21 + mode * 0.07)) * 0.0025);
      phases[mode] += (2 * Math.PI * frequency) / sampleRate;
      resonant += Math.sin(phases[mode] + mode * 0.31) * Math.exp(-time * mode * 0.12) / (1 + mode * 0.8);
    }
    const whiteCommon = random() * 2 - 1;
    const lowCoefficient = 1 - Math.exp((-2 * Math.PI * (150 + variant * 11)) / sampleRate);
    lowNoise += lowCoefficient * (whiteCommon - lowNoise);
    const leftNoise = random() * 2 - 1;
    const rightNoise = random() * 2 - 1;
    const sideCoefficient = 1 - Math.exp((-2 * Math.PI * (620 + variant * 23)) / sampleRate);
    sideLowLeft += sideCoefficient * (leftNoise - sideLowLeft);
    sideLowRight += sideCoefficient * (rightNoise - sideLowRight);
    const highSide = (leftNoise - sideLowLeft - (rightNoise - sideLowRight)) * 0.5;
    const movement = 0.76 + 0.24 * Math.sin(2 * Math.PI * (0.42 + variant * 0.018) * time + variant);
    const mono = softClip((resonant * 0.56 + lowNoise * 0.34) * attack * decay * movement, 1.72);
    const side = highSide * attack * decay * 0.055;
    buffer.left[index] = mono + side;
    buffer.right[index] = mono - side;
  }
  return finalise(buffer, { peakTarget: 0.48, fadeInSeconds: 0.012, fadeOutSeconds: 0.14 });
}

function lowMotion(seed, noteFrequency, variant) {
  const random = randomFrom(seed);
  const duration = 2.45 + (variant % 4) * 0.28;
  const buffer = createBuffer(duration);
  let phase = 0;
  let subPhase = 0;
  let noiseLow = 0;

  for (let index = 0; index < buffer.left.length; index += 1) {
    const time = index / sampleRate;
    const progress = index / (buffer.left.length - 1);
    const envelope = smoothstep(Math.min(1, progress * 12)) * smoothstep(Math.min(1, (1 - progress) * 7));
    const lfo = Math.sin(2 * Math.PI * (0.31 + variant * 0.013) * time + variant * 0.4);
    phase += (2 * Math.PI * noteFrequency * (1 + lfo * 0.006)) / sampleRate;
    subPhase += (2 * Math.PI * noteFrequency * 0.5) / sampleRate;
    const fm = Math.sin(phase * 1.5 + time * 0.7) * (0.7 + 0.18 * lfo);
    const fundamental = Math.sin(phase + fm) * 0.72;
    const sub = Math.sin(subPhase) * 0.18;
    const harmonic = Math.sin(phase * (6 + (variant % 4)) + lfo * 0.8) * 0.11;
    const white = random() * 2 - 1;
    const coefficient = 1 - Math.exp((-2 * Math.PI * (340 + variant * 19)) / sampleRate);
    noiseLow += coefficient * (white - noiseLow);
    const mono = softClip((fundamental + sub + noiseLow * 0.08) * envelope, 1.58);
    const side = (harmonic + (white - noiseLow) * 0.018) * envelope * (0.32 + 0.18 * lfo);
    buffer.left[index] = mono + side;
    buffer.right[index] = mono - side;
  }
  return finalise(buffer, { peakTarget: 0.5, fadeInSeconds: 0.018, fadeOutSeconds: 0.13 });
}

function writeWav24(buffer) {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = buffer.left.length * blockAlign;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * blockAlign, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitDepth, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataBytes, 40);

  let offset = 44;
  for (let index = 0; index < buffer.left.length; index += 1) {
    for (const sample of [buffer.left[index], buffer.right[index]]) {
      const value = Math.max(-1, Math.min(1, sample));
      const integer = Math.round(value < 0 ? value * 8_388_608 : value * 8_388_607);
      wav.writeIntLE(integer, offset, 3);
      offset += 3;
    }
  }
  return wav;
}

function buildReel(rendered) {
  const selections = [
    ["01_Sub_Pulses/TLEA_Sub_C1_01.wav", 1.0],
    ["01_Sub_Pulses/TLEA_Sub_G1_08.wav", 1.0],
    ["02_Saturated_Bass_Stabs/TLEA_Stab_D1_03.wav", 1.2],
    ["02_Saturated_Bass_Stabs/TLEA_Stab_Ab1_09.wav", 1.2],
    ["03_Rumble_Tails/TLEA_Rumble_C1_01.wav", 2.25],
    ["03_Rumble_Tails/TLEA_Rumble_Gb1_07.wav", 2.25],
    ["04_Low_Frequency_Motion/TLEA_Motion_E1_05.wav", 2.0],
    ["04_Low_Frequency_Motion/TLEA_Motion_Bb1_11.wav", 2.0],
  ];
  const gapFrames = Math.round(0.18 * sampleRate);
  const leadFrames = Math.round(0.12 * sampleRate);
  const clipFrames = selections.map(([, seconds]) => Math.round(seconds * sampleRate));
  const totalFrames = leadFrames * 2 + clipFrames.reduce((sum, length) => sum + length, 0) + gapFrames * (selections.length - 1);
  const reel = { left: new Float64Array(totalFrames), right: new Float64Array(totalFrames) };
  let offset = leadFrames;
  for (let selectionIndex = 0; selectionIndex < selections.length; selectionIndex += 1) {
    const [path] = selections[selectionIndex];
    const source = rendered.get(path);
    if (!source) throw new Error(`Audition reel source is missing: ${path}`);
    const length = Math.min(clipFrames[selectionIndex], source.left.length);
    const fadeIn = Math.round(0.004 * sampleRate);
    const fadeOut = Math.round(0.055 * sampleRate);
    for (let index = 0; index < length; index += 1) {
      const inGain = index < fadeIn ? smoothstep(index / fadeIn) : 1;
      const remaining = length - 1 - index;
      const outGain = remaining < fadeOut ? smoothstep(remaining / fadeOut) : 1;
      reel.left[offset + index] = source.left[index] * inGain * outGain;
      reel.right[offset + index] = source.right[index] * inGain * outGain;
    }
    offset += length + (selectionIndex < selections.length - 1 ? gapFrames : 0);
  }
  return finalise(reel, { peakTarget: 0.68, fadeInSeconds: 0.01, fadeOutSeconds: 0.08 }).buffer;
}

const families = [
  { folder: "01_Sub_Pulses", stem: "Sub", render: subPulse },
  { folder: "02_Saturated_Bass_Stabs", stem: "Stab", render: saturatedStab },
  { folder: "03_Rumble_Tails", stem: "Rumble", render: rumbleTail },
  { folder: "04_Low_Frequency_Motion", stem: "Motion", render: lowMotion },
];

await rm(join(root, "pack"), { recursive: true, force: true });
await rm(qaRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await mkdir(qaRoot, { recursive: true });

const manifest = [];
const rendered = new Map();
for (const family of families) {
  await mkdir(join(outputRoot, family.folder), { recursive: true });
  for (let noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
    const [note, frequency] = notes[noteIndex];
    const number = String(noteIndex + 1).padStart(2, "0");
    const filename = `TLEA_${family.stem}_${note}_${number}.wav`;
    const relativePath = `${family.folder}/${filename}`;
    const result = family.render(filename, frequency, noteIndex);
    await writeFile(join(outputRoot, relativePath), writeWav24(result.buffer));
    rendered.set(relativePath, result.buffer);
    manifest.push({
      file: relativePath,
      family: family.folder,
      root_note: note,
      root_frequency_hz: frequency,
      duration_seconds: Number((result.buffer.left.length / sampleRate).toFixed(3)),
      sample_rate: sampleRate,
      bit_depth: bitDepth,
      channels,
      sample_peak_dbfs: result.samplePeakDbfs,
      rms_dbfs: result.rmsDbfs,
    });
    console.log(relativePath);
  }
}

await writeFile(
  join(outputRoot, "MANIFEST.json"),
  `${JSON.stringify(
    {
      product: "Techno Low-End Architecture",
      artist: "Hologram People",
      generator_version: 1,
      files: manifest,
    },
    null,
    2,
  )}\n`,
);
await copyFile(join(root, "README.txt"), join(outputRoot, "README.txt"));
await copyFile(join(root, "LICENSE.txt"), join(outputRoot, "LICENSE.txt"));

const reelWav = join(qaRoot, "TLEA_Audition_Reel.wav");
const reelMp3 = join(qaRoot, "TLEA_Audition_Reel.mp3");
await writeFile(reelWav, writeWav24(buildReel(rendered)));
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    reelWav,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "320k",
    "-ar",
    String(sampleRate),
    "-metadata",
    "title=Techno Low-End Architecture — Audition Reel",
    "-metadata",
    "artist=Hologram People",
    reelMp3,
  ],
  { stdio: "inherit" },
);

console.log(`Rendered ${manifest.length} WAV files to ${outputRoot}`);
console.log(`Rendered audition reel to ${reelMp3}`);
