import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const packName = "Raw_Techno_Kick_Architecture_by_Hologram_People";
const outputRoot = join(root, "pack", packName);
const sampleRate = 48_000;
const peakTarget = 0.62;

function hash(text) {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function randomFrom(seedText) {
  let state = hash(seedText) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

function createBuffer(seconds) {
  const length = Math.round(seconds * sampleRate);
  return { left: new Float64Array(length), right: new Float64Array(length) };
}

function softClip(value, drive) {
  return Math.tanh(value * drive) / Math.tanh(drive);
}

function highPass(data, coefficient = 0.996) {
  let previousInput = 0;
  let previousOutput = 0;
  for (let i = 0; i < data.length; i += 1) {
    const input = data[i];
    const output = coefficient * (previousOutput + input - previousInput);
    data[i] = output;
    previousInput = input;
    previousOutput = output;
  }
}

function addDelay(buffer, seconds, feedback, wet) {
  const delay = Math.round(seconds * sampleRate);
  for (let i = delay; i < buffer.left.length; i += 1) {
    buffer.left[i] += buffer.right[i - delay] * wet;
    buffer.right[i] += buffer.left[i - delay] * wet;
    buffer.left[i] += buffer.left[i - delay] * feedback;
    buffer.right[i] += buffer.right[i - delay] * feedback;
  }
}

function finalise(buffer, fadeOutSeconds = 0.12) {
  highPass(buffer.left);
  highPass(buffer.right);
  const fadeOut = Math.max(2, Math.round(fadeOutSeconds * sampleRate));
  let peak = 0;
  for (let i = 0; i < buffer.left.length; i += 1) {
    if (i < 16) {
      const gain = i / 16;
      buffer.left[i] *= gain;
      buffer.right[i] *= gain;
    }
    if (i >= buffer.left.length - fadeOut) {
      const gain = (buffer.left.length - 1 - i) / fadeOut;
      buffer.left[i] *= Math.max(0, gain);
      buffer.right[i] *= Math.max(0, gain);
    }
    peak = Math.max(peak, Math.abs(buffer.left[i]), Math.abs(buffer.right[i]));
  }
  const gain = peak > 0 ? peakTarget / peak : 1;
  for (let i = 0; i < buffer.left.length; i += 1) {
    buffer.left[i] *= gain;
    buffer.right[i] *= gain;
  }
  buffer.left[0] = 0;
  buffer.right[0] = 0;
  buffer.left[buffer.left.length - 1] = 0;
  buffer.right[buffer.right.length - 1] = 0;
  return buffer;
}

function synthKick(seed, family, variant) {
  const random = randomFrom(seed);
  const durations = { Deep: 1.7, Punch: 1.25, Industrial: 1.8, Rumble: 2.8 };
  const buffer = createBuffer(durations[family] + (variant % 3) * 0.08);
  const startFrequency = 125 + random() * 70;
  const bodyFrequency = family === "Deep" || family === "Rumble" ? 43 + random() * 9 : 49 + random() * 13;
  const pitchDecay = family === "Punch" ? 0.018 + random() * 0.012 : 0.035 + random() * 0.025;
  const bodyDecay = family === "Deep" ? 0.62 : family === "Rumble" ? 0.75 : 0.34 + random() * 0.16;
  let phase = 0;
  let noiseState = 0;

  for (let i = 0; i < buffer.left.length; i += 1) {
    const time = i / sampleRate;
    const frequency = bodyFrequency + (startFrequency - bodyFrequency) * Math.exp(-time / pitchDecay);
    phase += (2 * Math.PI * frequency) / sampleRate;
    const body = Math.sin(phase) * Math.exp(-time / bodyDecay);
    const clickNoise = (random() * 2 - 1) * Math.exp(-time / (0.0025 + random() * 0.0015));
    const clickTone = Math.sin(2 * Math.PI * (900 + variant * 73) * time) * Math.exp(-time / 0.006);
    noiseState += ((random() * 2 - 1) - noiseState) * 0.16;
    const texture = noiseState * Math.exp(-time / 0.11);
    let sample = body;

    if (family === "Deep") sample = body * 1.08 + clickNoise * 0.06 + clickTone * 0.025;
    if (family === "Punch") sample = body * 0.92 + clickNoise * 0.20 + clickTone * 0.12;
    if (family === "Industrial") {
      const metal = Math.sin(2 * Math.PI * (171 + variant * 11) * time + Math.sin(phase) * 2.2);
      sample = softClip(body * 1.15 + metal * Math.exp(-time / 0.18) * 0.18 + texture * 0.14, 2.2 + random());
    }
    if (family === "Rumble") {
      const tail = Math.sin(phase * 0.51 + Math.sin(phase * 0.08) * 2.5) * Math.exp(-time / 1.15);
      sample = softClip(body + tail * (1 - Math.exp(-time / 0.08)) * 0.55 + texture * 0.08, 1.65);
    }

    const stereo = family === "Rumble" || family === "Industrial" ? texture * 0.055 : 0;
    buffer.left[i] = sample + stereo;
    buffer.right[i] = sample - stereo;
  }

  if (family === "Rumble") addDelay(buffer, 0.145 + variant * 0.002, 0.24, 0.16);
  if (family === "Industrial") addDelay(buffer, 0.047 + variant * 0.001, 0.12, 0.08);
  return finalise(buffer, family === "Rumble" ? 0.28 : 0.15);
}

function writeWav24(buffer) {
  const channels = 2;
  const bytesPerSample = 3;
  const dataBytes = buffer.left.length * channels * bytesPerSample;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  wav.writeUInt16LE(channels * bytesPerSample, 32);
  wav.writeUInt16LE(24, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let i = 0; i < buffer.left.length; i += 1) {
    for (const sample of [buffer.left[i], buffer.right[i]]) {
      const value = Math.max(-1, Math.min(1, sample));
      wav.writeIntLE(Math.round(value * 8_388_607), offset, 3);
      offset += 3;
    }
  }
  return wav;
}

const families = ["Deep", "Punch", "Industrial", "Rumble"];
const manifest = [];
for (const [familyIndex, family] of families.entries()) {
  const folder = `${String(familyIndex + 1).padStart(2, "0")}_${family}`;
  await mkdir(join(outputRoot, folder), { recursive: true });
  for (let index = 1; index <= 10; index += 1) {
    const number = String(index).padStart(2, "0");
    const name = `RTKA_Kick_${family}_${number}.wav`;
    const buffer = synthKick(name, family, index);
    await writeFile(join(outputRoot, folder, name), writeWav24(buffer));
    manifest.push({ file: `${folder}/${name}`, family, sample_rate: sampleRate, bit_depth: 24, channels: 2 });
  }
}

await writeFile(
  join(outputRoot, "MANIFEST.json"),
  `${JSON.stringify({ product: "Raw Techno Kick Architecture", artist: "Hologram People", files: manifest }, null, 2)}\n`,
);
await copyFile(join(root, "README.txt"), join(outputRoot, "README.txt"));
await copyFile(join(root, "LICENSE.txt"), join(outputRoot, "LICENSE.txt"));
console.log(`Rendered ${manifest.length} WAV files to ${outputRoot}`);
