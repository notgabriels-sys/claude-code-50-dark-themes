import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, "pack", "Industrial_Tension_FX_by_Hologram_People");
const sampleRate = 48_000;
const channels = 2;
const bitDepth = 24;
// Sample-peak target leaves enough interpolation headroom to keep every export
// at or below the provisional -1 dBTP ceiling measured by FFmpeg's true-peak meter.
const peakTarget = 0.62;

function hash(text) {
  let value = 2166136261;
  for (const character of text) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function randomFrom(seedText) {
  let state = hash(seedText);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function smoothstep(value) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

function equalPowerPan(value, pan) {
  const angle = ((pan + 1) * Math.PI) / 4;
  return [value * Math.cos(angle), value * Math.sin(angle)];
}

function createBuffer(seconds) {
  const length = Math.round(seconds * sampleRate);
  return [new Float64Array(length), new Float64Array(length)];
}

function addStereo(buffer, index, value, pan = 0) {
  const [left, right] = equalPowerPan(value, pan);
  buffer[0][index] += left;
  buffer[1][index] += right;
}

function addDelay(buffer, delaySeconds, feedback, wet) {
  const delay = Math.round(delaySeconds * sampleRate);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer[channel];
    for (let index = delay; index < data.length; index += 1) {
      data[index] += data[index - delay] * feedback * wet;
    }
  }
}

function highPassInPlace(data, coefficient = 0.995) {
  let previousInput = 0;
  let previousOutput = 0;
  for (let index = 0; index < data.length; index += 1) {
    const input = data[index];
    const outputValue = input - previousInput + coefficient * previousOutput;
    data[index] = outputValue;
    previousInput = input;
    previousOutput = outputValue;
  }
}

function finalise(buffer, fadeInSeconds = 0.01, fadeOutSeconds = 0.12) {
  const fadeIn = Math.max(1, Math.round(fadeInSeconds * sampleRate));
  const fadeOut = Math.max(1, Math.round(fadeOutSeconds * sampleRate));
  let peak = 0;

  for (const data of buffer) {
    highPassInPlace(data);
    for (let index = 0; index < data.length; index += 1) {
      const inGain = Math.min(1, index / fadeIn);
      const outGain = Math.min(1, (data.length - 1 - index) / fadeOut);
      data[index] = Math.tanh(data[index] * 0.9) * inGain * outGain;
      peak = Math.max(peak, Math.abs(data[index]));
    }
  }

  const gain = peak > 0 ? peakTarget / peak : 1;
  let sumSquares = 0;
  let sampleCount = 0;
  let finalPeak = 0;
  for (const data of buffer) {
    for (let index = 0; index < data.length; index += 1) {
      data[index] *= gain;
      finalPeak = Math.max(finalPeak, Math.abs(data[index]));
      sumSquares += data[index] ** 2;
      sampleCount += 1;
    }
  }

  return {
    peak: finalPeak,
    peakDbfs: 20 * Math.log10(finalPeak || Number.MIN_VALUE),
    rmsDbfs: 20 * Math.log10(Math.sqrt(sumSquares / sampleCount) || Number.MIN_VALUE),
  };
}

function writeWav24(buffer) {
  const length = buffer[0].length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = length * blockAlign;
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
  for (let index = 0; index < length; index += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const value = Math.max(-1, Math.min(1, buffer[channel][index]));
      const integer = Math.round(value < 0 ? value * 8_388_608 : value * 8_388_607);
      wav.writeIntLE(integer, offset, 3);
      offset += 3;
    }
  }
  return wav;
}

function impact(seed, seconds, variant) {
  const random = randomFrom(seed);
  const buffer = createBuffer(seconds);
  const length = buffer[0].length;
  const subStart = 78 + variant * 4 + random() * 20;
  const subEnd = 32 + random() * 9;
  const metal = Array.from({ length: 5 }, (_, index) => ({
    frequency: 190 + index * (91 + variant * 4) + random() * 70,
    decay: 1.7 + random() * 3.4,
    level: 0.12 + random() * 0.1,
    pan: -0.65 + random() * 1.3,
  }));
  let subPhase = 0;

  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const progress = index / length;
    const transient = (random() * 2 - 1) * Math.exp(-time * (24 + variant));
    const subFrequency = subEnd + (subStart - subEnd) * Math.exp(-time * 7.2);
    subPhase += (2 * Math.PI * subFrequency) / sampleRate;
    const sub = Math.sin(subPhase) * Math.exp(-time * 2.2) * 0.9;
    addStereo(buffer, index, transient * 0.8 + sub, 0);

    for (const mode of metal) {
      const wobble = 1 + Math.sin(2 * Math.PI * (0.17 + variant * 0.01) * time) * 0.004;
      const value =
        Math.sin(2 * Math.PI * mode.frequency * wobble * time) *
        Math.exp(-time * mode.decay) *
        mode.level;
      addStereo(buffer, index, value, mode.pan);
    }

    if (progress < 0.025) {
      addStereo(buffer, index, (random() * 2 - 1) * (1 - progress / 0.025) * 0.5, 0);
    }
  }

  addDelay(buffer, 0.071 + variant * 0.002, 0.33, 0.8);
  addDelay(buffer, 0.113 + variant * 0.003, 0.22, 0.65);
  return buffer;
}

function riser(seed, seconds, variant) {
  const random = randomFrom(seed);
  const buffer = createBuffer(seconds);
  const length = buffer[0].length;
  let lowLeft = 0;
  let lowRight = 0;
  let phase = 0;

  for (let index = 0; index < length; index += 1) {
    const progress = index / (length - 1);
    const time = index / sampleRate;
    const envelope = smoothstep(progress) ** (1.25 + variant * 0.03);
    const cutoff = 110 + progress ** 2.4 * (10_500 + variant * 130);
    const coefficient = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    const whiteLeft = random() * 2 - 1;
    const whiteRight = random() * 2 - 1;
    lowLeft += coefficient * (whiteLeft - lowLeft);
    lowRight += coefficient * (whiteRight - lowRight);
    const frequency = 42 * 2 ** (progress * (3.2 + variant * 0.045));
    phase += (2 * Math.PI * frequency) / sampleRate;
    const tonal = Math.sin(phase + Math.sin(time * 1.7) * 0.35) * 0.18;
    const gate = 0.72 + 0.28 * Math.sin(2 * Math.PI * (2 + variant * 0.125) * time) ** 2;
    buffer[0][index] += (lowLeft * 0.68 + tonal) * envelope * gate;
    buffer[1][index] += (lowRight * 0.68 + tonal * 0.93) * envelope * gate;
  }

  addDelay(buffer, 0.083 + variant * 0.004, 0.18, 0.5);
  return buffer;
}

function downlifter(seed, seconds, variant) {
  const random = randomFrom(seed);
  const buffer = createBuffer(seconds);
  const length = buffer[0].length;
  let lowLeft = 0;
  let lowRight = 0;
  let phase = 0;

  for (let index = 0; index < length; index += 1) {
    const progress = index / (length - 1);
    const time = index / sampleRate;
    const envelope = (1 - smoothstep(progress)) ** 0.72;
    const cutoff = 240 + (1 - progress) ** 2.1 * (11_000 + variant * 120);
    const coefficient = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    lowLeft += coefficient * (random() * 2 - 1 - lowLeft);
    lowRight += coefficient * (random() * 2 - 1 - lowRight);
    const frequency = 54 * 2 ** ((1 - progress) * (3 + variant * 0.04));
    phase += (2 * Math.PI * frequency) / sampleRate;
    const tonal = Math.sin(phase + Math.sin(time * 0.9) * 0.5) * 0.16;
    const pan = Math.sin(time * (0.7 + variant * 0.03)) * 0.45;
    addStereo(buffer, index, (lowLeft + lowRight) * 0.36 * envelope + tonal * envelope, pan);
    buffer[0][index] += lowLeft * 0.24 * envelope;
    buffer[1][index] += lowRight * 0.24 * envelope;
  }
  return buffer;
}

const droneNotes = [
  ["C1", 32.703],
  ["D1", 36.708],
  ["Eb1", 38.891],
  ["F1", 43.654],
  ["Gb1", 46.249],
  ["G1", 48.999],
  ["A1", 55.0],
  ["Bb1", 58.27],
];

function drone(seed, seconds, variant) {
  const random = randomFrom(seed);
  const buffer = createBuffer(seconds);
  const length = buffer[0].length;
  const [, fundamental] = droneNotes[variant];
  const phases = [0, 0, 0, 0];
  const detunes = [-0.006, -0.0015, 0.0023, 0.007];
  let noiseLeft = 0;
  let noiseRight = 0;

  for (let index = 0; index < length; index += 1) {
    const progress = index / (length - 1);
    const time = index / sampleRate;
    const envelope = smoothstep(Math.min(1, progress * 8)) * smoothstep(Math.min(1, (1 - progress) * 6));
    let left = 0;
    let right = 0;
    for (let voice = 0; voice < phases.length; voice += 1) {
      const frequency = fundamental * (1 + detunes[voice]);
      phases[voice] += (2 * Math.PI * frequency) / sampleRate;
      const fm = Math.sin(2 * Math.PI * (0.07 + voice * 0.017) * time) * (0.5 + voice * 0.17);
      const signal = Math.sin(phases[voice] + fm) * (0.2 - voice * 0.018);
      const pan = -0.72 + (voice / (phases.length - 1)) * 1.44;
      const [voiceLeft, voiceRight] = equalPowerPan(signal, pan);
      left += voiceLeft;
      right += voiceRight;
    }
    const cutoff = 180 + (0.5 + 0.5 * Math.sin(time * 0.31 + variant)) * 820;
    const coefficient = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    noiseLeft += coefficient * (random() * 2 - 1 - noiseLeft);
    noiseRight += coefficient * (random() * 2 - 1 - noiseRight);
    buffer[0][index] = (left + noiseLeft * 0.11) * envelope;
    buffer[1][index] = (right + noiseRight * 0.11) * envelope;
  }
  addDelay(buffer, 0.137 + variant * 0.006, 0.26, 0.5);
  return buffer;
}

function noiseSweep(seed, seconds, variant) {
  const random = randomFrom(seed);
  const buffer = createBuffer(seconds);
  const length = buffer[0].length;
  let lowLeft = 0;
  let lowRight = 0;
  let slowLeft = 0;
  let slowRight = 0;
  const rising = variant % 2 === 0;

  for (let index = 0; index < length; index += 1) {
    const progress = index / (length - 1);
    const shape = rising ? progress : 1 - progress;
    const envelope = Math.sin(Math.PI * progress) ** 0.7;
    const highCutoff = 700 + shape ** 2 * (10_000 + variant * 100);
    const lowCutoff = 70 + shape * (1_700 + variant * 55);
    const highCoefficient = 1 - Math.exp((-2 * Math.PI * highCutoff) / sampleRate);
    const lowCoefficient = 1 - Math.exp((-2 * Math.PI * lowCutoff) / sampleRate);
    const whiteLeft = random() * 2 - 1;
    const whiteRight = random() * 2 - 1;
    lowLeft += highCoefficient * (whiteLeft - lowLeft);
    lowRight += highCoefficient * (whiteRight - lowRight);
    slowLeft += lowCoefficient * (whiteLeft - slowLeft);
    slowRight += lowCoefficient * (whiteRight - slowRight);
    buffer[0][index] = (lowLeft - slowLeft) * envelope;
    buffer[1][index] = (lowRight - slowRight) * envelope;
  }
  return buffer;
}

const definitions = [
  ...Array.from({ length: 10 }, (_, index) => ({
    folder: "01_Impacts",
    name: `ITFX_Impact_Industrial_${String(index + 1).padStart(2, "0")}.wav`,
    seconds: 2.5 + (index % 3) * 0.35,
    render: (seed) => impact(seed, 2.5 + (index % 3) * 0.35, index),
  })),
  ...Array.from({ length: 10 }, (_, index) => ({
    folder: "02_Risers",
    name: `ITFX_Riser_Tension_8s_${String(index + 1).padStart(2, "0")}.wav`,
    seconds: 8,
    render: (seed) => riser(seed, 8, index),
  })),
  ...Array.from({ length: 10 }, (_, index) => ({
    folder: "03_Downlifters",
    name: `ITFX_Downlifter_Industrial_8s_${String(index + 1).padStart(2, "0")}.wav`,
    seconds: 8,
    render: (seed) => downlifter(seed, 8, index),
  })),
  ...droneNotes.map(([note], index) => ({
    folder: "04_Drones",
    name: `ITFX_Drone_${note}_12s_${String(index + 1).padStart(2, "0")}.wav`,
    seconds: 12,
    render: (seed) => drone(seed, 12, index),
  })),
  ...Array.from({ length: 10 }, (_, index) => ({
    folder: "05_Noise_Sweeps",
    name: `ITFX_Noise_${index % 2 === 0 ? "Rise" : "Fall"}_4s_${String(index + 1).padStart(2, "0")}.wav`,
    seconds: 4,
    render: (seed) => noiseSweep(seed, 4, index),
  })),
];

await rm(join(root, "pack"), { recursive: true, force: true });
await mkdir(output, { recursive: true });

const manifest = [];
for (const definition of definitions) {
  const destination = join(output, definition.folder, definition.name);
  await mkdir(dirname(destination), { recursive: true });
  const buffer = definition.render(definition.name);
  const measurements = finalise(
    buffer,
    definition.folder === "01_Impacts" ? 0.001 : 0.02,
    definition.folder === "01_Impacts" ? 0.18 : 0.12,
  );
  await writeFile(destination, writeWav24(buffer));
  manifest.push({
    file: `${definition.folder}/${definition.name}`,
    duration_seconds: Number((buffer[0].length / sampleRate).toFixed(3)),
    sample_rate: sampleRate,
    bit_depth: bitDepth,
    channels,
    sample_peak_dbfs: Number(measurements.peakDbfs.toFixed(3)),
    rms_dbfs: Number(measurements.rmsDbfs.toFixed(3)),
  });
  console.log(definition.name);
}

await writeFile(
  join(output, "MANIFEST.json"),
  `${JSON.stringify(
    {
      product: "Industrial Tension & Transition FX",
      artist: "Hologram People",
      generated_at: new Date().toISOString(),
      provisional_delivery_assumptions: {
        format: "WAV PCM",
        sample_rate: sampleRate,
        bit_depth: bitDepth,
        channels: "stereo",
        peak_target_dbfs: Number((20 * Math.log10(peakTarget)).toFixed(3)),
      },
      files: manifest,
    },
    null,
    2,
  )}\n`,
);

await copyFile(join(root, "README.txt"), join(output, "README.txt"));
await copyFile(join(root, "LICENSE.txt"), join(output, "LICENSE.txt"));

console.log(`Rendered ${manifest.length} WAV files to ${output}`);
