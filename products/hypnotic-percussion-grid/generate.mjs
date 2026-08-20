import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const packName = "Hypnotic_Percussion_Grid_by_Hologram_People";
const outputRoot = join(root, "pack", packName);
const sampleRate = 48_000;
const peakTarget = 0.5;

function hash(text) {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function randomFrom(text) {
  let state = hash(text) || 1;
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

function softClip(value, drive = 1.8) {
  return Math.tanh(value * drive) / Math.tanh(drive);
}

function highPass(data, coefficient = 0.985) {
  let previousInput = 0;
  let previousOutput = 0;
  for (let index = 0; index < data.length; index += 1) {
    const input = data[index];
    const output = coefficient * (previousOutput + input - previousInput);
    data[index] = output;
    previousInput = input;
    previousOutput = output;
  }
}

function finalise(buffer, fadeOutSeconds = 0.025) {
  highPass(buffer.left);
  highPass(buffer.right);
  const fadeIn = 8;
  const fadeOut = Math.max(16, Math.round(fadeOutSeconds * sampleRate));
  let peak = 0;
  for (let index = 0; index < buffer.left.length; index += 1) {
    if (index < fadeIn) {
      const gain = index / fadeIn;
      buffer.left[index] *= gain;
      buffer.right[index] *= gain;
    }
    if (index >= buffer.left.length - fadeOut) {
      const gain = Math.max(0, (buffer.left.length - 1 - index) / fadeOut);
      buffer.left[index] *= gain;
      buffer.right[index] *= gain;
    }
    peak = Math.max(peak, Math.abs(buffer.left[index]), Math.abs(buffer.right[index]));
  }
  const gain = peak > 0 ? peakTarget / peak : 1;
  for (let index = 0; index < buffer.left.length; index += 1) {
    buffer.left[index] *= gain;
    buffer.right[index] *= gain;
  }
  buffer.left[0] = 0;
  buffer.right[0] = 0;
  buffer.left[buffer.left.length - 1] = 0;
  buffer.right[buffer.right.length - 1] = 0;
  return buffer;
}

function closedHat(seed, variant) {
  const random = randomFrom(seed);
  const duration = 0.09 + (variant % 6) * 0.018;
  const buffer = createBuffer(duration);
  let highState = 0;
  let previousNoise = 0;
  const decay = 0.017 + random() * 0.035;
  for (let index = 0; index < buffer.left.length; index += 1) {
    const time = index / sampleRate;
    const noise = random() * 2 - 1;
    highState = noise - previousNoise * 0.82;
    previousNoise = noise;
    const metal = Math.sin(2 * Math.PI * (5_900 + variant * 97) * time) * 0.28
      + Math.sin(2 * Math.PI * (8_300 + variant * 131) * time) * 0.18;
    const envelope = Math.exp(-time / decay);
    const sample = softClip((highState * 0.78 + metal) * envelope, 1.45);
    const width = Math.sin(2 * Math.PI * (11_000 + variant * 53) * time) * envelope * 0.05;
    buffer.left[index] = sample + width;
    buffer.right[index] = sample - width;
  }
  return finalise(buffer, 0.012);
}

function metallic(seed, variant) {
  const random = randomFrom(seed);
  const duration = 0.38 + (variant % 5) * 0.12;
  const buffer = createBuffer(duration);
  const base = 210 + variant * 19 + random() * 35;
  const ratios = [1, 1.43, 2.17, 3.71, 5.12];
  for (let index = 0; index < buffer.left.length; index += 1) {
    const time = index / sampleRate;
    let sample = 0;
    for (let partial = 0; partial < ratios.length; partial += 1) {
      const decay = 0.08 + partial * 0.045 + random() * 0.015;
      sample += Math.sin(2 * Math.PI * base * ratios[partial] * time + partial * 0.73) * Math.exp(-time / decay) / (partial + 1);
    }
    const strike = (random() * 2 - 1) * Math.exp(-time / 0.004) * 0.16;
    sample = softClip(sample * 0.56 + strike, 1.6);
    const side = Math.sin(2 * Math.PI * base * 2.61 * time) * Math.exp(-time / 0.16) * 0.05;
    buffer.left[index] = sample + side;
    buffer.right[index] = sample - side;
  }
  return finalise(buffer, 0.045);
}

function clickTick(seed, variant) {
  const random = randomFrom(seed);
  const duration = 0.035 + (variant % 8) * 0.012;
  const buffer = createBuffer(duration);
  const frequency = 620 + variant * 173;
  let phase = 0;
  for (let index = 0; index < buffer.left.length; index += 1) {
    const time = index / sampleRate;
    phase += (2 * Math.PI * (frequency + 1_900 * Math.exp(-time / 0.003))) / sampleRate;
    const tone = Math.sin(phase) * Math.exp(-time / (0.006 + (variant % 4) * 0.003));
    const noise = (random() * 2 - 1) * Math.exp(-time / 0.0025);
    const sample = softClip(tone * 0.72 + noise * 0.32, 2.1);
    const pan = ((variant % 7) - 3) / 28;
    buffer.left[index] = sample * (1 - pan);
    buffer.right[index] = sample * (1 + pan);
  }
  return finalise(buffer, 0.008);
}

function shaker(seed, variant) {
  const random = randomFrom(seed);
  const duration = 0.24 + (variant % 6) * 0.07;
  const buffer = createBuffer(duration);
  let filtered = 0;
  let previous = 0;
  const pulses = 3 + (variant % 5);
  for (let index = 0; index < buffer.left.length; index += 1) {
    const time = index / sampleRate;
    const noise = random() * 2 - 1;
    filtered = noise - previous * 0.76;
    previous = noise;
    let envelope = 0;
    for (let pulse = 0; pulse < pulses; pulse += 1) {
      const center = (pulse + 0.35) * duration / pulses;
      const distance = Math.abs(time - center);
      envelope += Math.exp(-distance / (0.007 + random() * 0.003)) * (time >= center ? 0.7 : 1);
    }
    envelope *= Math.exp(-time / (duration * 0.8));
    const sample = softClip(filtered * envelope * 0.55, 1.5);
    const width = Math.sin(2 * Math.PI * (4_700 + variant * 83) * time) * envelope * 0.035;
    buffer.left[index] = sample + width;
    buffer.right[index] = sample - width;
  }
  return finalise(buffer, 0.02);
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
  for (let index = 0; index < buffer.left.length; index += 1) {
    for (const sample of [buffer.left[index], buffer.right[index]]) {
      wav.writeIntLE(Math.round(Math.max(-1, Math.min(1, sample)) * 8_388_607), offset, 3);
      offset += 3;
    }
  }
  return wav;
}

const families = [
  { folder: "01_Closed_Hats", label: "Closed_Hat", render: closedHat },
  { folder: "02_Metallic_Percussion", label: "Metallic_Perc", render: metallic },
  { folder: "03_Dry_Clicks_and_Ticks", label: "Dry_Click", render: clickTick },
  { folder: "04_Shakers_and_Noise", label: "Shaker_Noise", render: shaker },
];
const manifest = [];
for (const family of families) {
  await mkdir(join(outputRoot, family.folder), { recursive: true });
  for (let index = 1; index <= 16; index += 1) {
    const number = String(index).padStart(2, "0");
    const filename = `HPG_${family.label}_${number}.wav`;
    const buffer = family.render(filename, index);
    await writeFile(join(outputRoot, family.folder, filename), writeWav24(buffer));
    manifest.push({ file: `${family.folder}/${filename}`, family: family.folder, sample_rate: sampleRate, bit_depth: 24, channels: 2 });
  }
}
await writeFile(join(outputRoot, "MANIFEST.json"), `${JSON.stringify({ product: "Hypnotic Percussion Grid", artist: "Hologram People", files: manifest }, null, 2)}\n`);
await copyFile(join(root, "README.txt"), join(outputRoot, "README.txt"));
await copyFile(join(root, "LICENSE.txt"), join(outputRoot, "LICENSE.txt"));
console.log(`Rendered ${manifest.length} WAV files to ${outputRoot}`);
