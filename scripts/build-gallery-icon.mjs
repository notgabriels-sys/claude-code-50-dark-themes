#!/usr/bin/env node
// Draws plugins/theme-gallery/logo.png, the /themes gallery mod's 1024x1024
// icon: four rows like the pane's own, each a colour chip and a name bar, on a
// dark ground. Every colour is looked up by theme file and key in the free
// packs (the 50 *.json files at the repository root and
// plugins/dark-themes-vol-2/themes/*.json), so the icon can only carry colours
// the free themes already publish.
//
//   node scripts/build-gallery-icon.mjs           redraws the icon
//   node scripts/build-gallery-icon.mjs --check   exits 1 when it is out of date
//
// scripts/verify.mjs decodes the committed icon and fails on any colour that is
// not a free theme colour or an anti-aliased edge between two of them, however
// the file was made. scripts/build-gallery-icon.test.mjs holds the icon to this
// drawing.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

import { GALLERY_PACKS } from "./build-gallery-data.mjs";

export const GALLERY_ICON_PATH = "plugins/theme-gallery/logo.png";
export const ICON_SIZE = 1024;

// Each colour names the free theme file and override key it comes from.
const GROUND = { file: "blackout.json", key: "userMessageBackground" };
const BAR = { file: "graphite.json", key: "inactive" };
// One chip per accent family the pane filters by, warm to violet.
const CHIPS = [
  { file: "amber-room.json", key: "claude" },
  { file: "blueprint.json", key: "claude" },
  { file: "greenhouse.json", key: "claude" },
  { file: "ultraviolet.json", key: "claude" },
];
const BAR_LENGTHS = [480, 368, 432, 304];

const CHIP = 136;
const ROW_GAP = 40;
const CHIP_RADIUS = 32;
const BAR_HEIGHT = 56;
const BAR_GAP = 48;
const MARGIN = (ICON_SIZE - (CHIPS.length * CHIP + (CHIPS.length - 1) * ROW_GAP)) / 2;
// Samples per pixel along each axis; edges blend the shape into the ground.
const SUPERSAMPLE = 8;

const HEX = /^#[0-9A-F]{6}$/;

function rgbOf(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function hexOf([red, green, blue]) {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

// Every override colour of the 62 free theme files, keyed by hex, with the
// file and key each one comes from.
export async function loadFreeColours(root) {
  const colours = new Map();
  for (const pack of GALLERY_PACKS) {
    const dir = new URL(pack.dir || "./", root);
    for (const file of (await readdir(dir)).filter((name) => name.endsWith(".json")).sort()) {
      const theme = JSON.parse(await readFile(new URL(file, dir), "utf8"));
      for (const [key, value] of Object.entries(theme.overrides ?? {})) {
        const hex = String(value).toUpperCase();
        if (!HEX.test(hex)) continue;
        if (!colours.has(hex)) colours.set(hex, []);
        colours.get(hex).push({ path: `${pack.dir}${file}`, file, key });
      }
    }
  }
  return colours;
}

function lookUp(freeColours, { file, key }) {
  for (const [hex, uses] of freeColours) {
    if (uses.some((use) => use.file === file && use.key === key)) return rgbOf(hex);
  }
  throw new Error(`The gallery icon names ${file} overrides.${key}, which is not a free theme colour.`);
}

function insideRoundedRect(px, py, { x, y, width, height, radius }) {
  if (px < x || px > x + width || py < y || py > y + height) return false;
  const dx = px - Math.min(Math.max(px, x + radius), x + width - radius);
  const dy = py - Math.min(Math.max(py, y + radius), y + height - radius);
  return dx * dx + dy * dy <= radius * radius;
}

export function iconShapes() {
  const shapes = [];
  CHIPS.forEach((chip, row) => {
    const top = MARGIN + row * (CHIP + ROW_GAP);
    shapes.push({ colour: chip, x: MARGIN, y: top, width: CHIP, height: CHIP, radius: CHIP_RADIUS });
    shapes.push({
      colour: BAR,
      x: MARGIN + CHIP + BAR_GAP,
      y: top + (CHIP - BAR_HEIGHT) / 2,
      width: BAR_LENGTHS[row],
      height: BAR_HEIGHT,
      radius: BAR_HEIGHT / 2,
    });
  });
  return shapes;
}

// RGB pixels, row by row. The shapes never touch, so an edge pixel is a blend
// of one shape's colour and the ground.
export async function renderGalleryIcon(root) {
  const freeColours = await loadFreeColours(root);
  const ground = lookUp(freeColours, GROUND);
  const pixels = Buffer.alloc(ICON_SIZE * ICON_SIZE * 3);
  for (let index = 0; index < ICON_SIZE * ICON_SIZE; index += 1) pixels.set(ground, index * 3);

  const samples = SUPERSAMPLE * SUPERSAMPLE;
  for (const shape of iconShapes()) {
    const colour = lookUp(freeColours, shape.colour);
    for (let py = Math.floor(shape.y); py < Math.ceil(shape.y + shape.height); py += 1) {
      for (let px = Math.floor(shape.x); px < Math.ceil(shape.x + shape.width); px += 1) {
        let hits = 0;
        for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
          for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
            const point = [px + (sx + 0.5) / SUPERSAMPLE, py + (sy + 0.5) / SUPERSAMPLE];
            if (insideRoundedRect(point[0], point[1], shape)) hits += 1;
          }
        }
        if (hits === 0) continue;
        const cover = hits / samples;
        const offset = (py * ICON_SIZE + px) * 3;
        for (let channel = 0; channel < 3; channel += 1) {
          pixels[offset + channel] = Math.round(ground[channel] * (1 - cover) + colour[channel] * cover);
        }
      }
    }
  }
  return pixels;
}

// ---------------------------------------------------------------------------
// PNG: 8-bit truecolour, no interlace. Enough to write the icon and to read it
// back, or any other 8-bit RGB or RGBA PNG, in the checks.
// ---------------------------------------------------------------------------
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function encodePng(pixels, width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // bit depth 8, truecolour, deflate, adaptive filtering, no interlace
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rows[y * (width * 3 + 1)] = 0; // filter: none
    pixels.copy(rows, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Returns { width, height, pixels, opaque }: RGB pixels, and a 0 in `opaque`
// for each fully transparent pixel of an RGBA image, which the colour check
// skips.
export function decodePng(data) {
  if (data.length < 8 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("not a PNG file");
  let offset = 8;
  let header;
  const idat = [];
  while (offset + 8 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const body = data.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") header = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!header) throw new Error("the PNG has no IHDR chunk");
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const [depth, colourType, , , interlace] = header.subarray(8, 13);
  if (depth !== 8 || (colourType !== 2 && colourType !== 6) || interlace !== 0) {
    throw new Error("only 8-bit, non-interlaced RGB or RGBA PNG files can be checked");
  }
  const channels = colourType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error("the PNG image data is truncated");
  const image = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? image[y * stride + x - channels] : 0;
      const up = y > 0 ? image[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? image[(y - 1) * stride + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const [toLeft, toUp, toUpLeft] = [left, up, upLeft].map((one) => Math.abs(estimate - one));
        value += toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      } else if (filter !== 0) throw new Error(`the PNG uses unknown row filter ${filter}`);
      image[y * stride + x] = value & 255;
    }
  }
  const pixels = Buffer.alloc(width * height * 3);
  const opaque = new Uint8Array(width * height).fill(1);
  for (let index = 0; index < width * height; index += 1) {
    image.copy(pixels, index * 3, index * channels, index * channels + 3);
    if (channels === 4 && image[index * channels + 3] === 0) opaque[index] = 0;
  }
  return { width, height, pixels, opaque };
}

// A colour that covers at least this share of the icon is one of its own
// colours and must be a free theme colour; anything rarer must be an edge
// blend of two of them.
const OWN_COLOUR_SHARE = 1 / 2000;
const BLEND_TOLERANCE = 2;

function onBlend(colour, from, to) {
  const span = to.map((channel, index) => channel - from[index]);
  const lengthSquared = span.reduce((sum, channel) => sum + channel * channel, 0);
  if (lengthSquared === 0) return false;
  const along = colour.reduce((sum, channel, index) => sum + (channel - from[index]) * span[index], 0) / lengthSquared;
  const t = Math.min(1, Math.max(0, along));
  return colour.every((channel, index) => Math.abs(channel - (from[index] + t * span[index])) <= BLEND_TOLERANCE);
}

// Every problem with the icon's colours, as sentences; empty when it is clean.
export function iconColourProblems({ width, height, pixels, opaque }, freeColours) {
  const counts = new Map();
  for (let index = 0; index < width * height; index += 1) {
    if (opaque && !opaque[index]) continue;
    const key = (pixels[index * 3] << 16) | (pixels[index * 3 + 1] << 8) | pixels[index * 3 + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rgb = (key) => [(key >> 16) & 255, (key >> 8) & 255, key & 255];
  const own = [...counts].filter(([, count]) => count >= width * height * OWN_COLOUR_SHARE);
  const problems = [];
  const freeOwn = [];
  for (const [key, count] of own) {
    const hex = hexOf(rgb(key));
    if (freeColours.has(hex)) freeOwn.push(rgb(key));
    else problems.push(`${hex} covers ${count} pixels and is not a colour of any free theme file`);
  }
  let stray = 0;
  let firstStray;
  for (const [key, count] of counts) {
    if (own.some(([ownKey]) => ownKey === key)) continue;
    const colour = rgb(key);
    const blends = freeOwn.some((from, index) => freeOwn.slice(index + 1).some((to) => onBlend(colour, from, to)));
    if (!blends) {
      stray += count;
      firstStray ??= hexOf(colour);
    }
  }
  if (stray > 0) {
    problems.push(`${stray} pixels, such as ${firstStray}, are neither a free theme colour nor an edge between two of the icon's colours`);
  }
  return problems;
}

async function main() {
  const root = new URL("../", import.meta.url);
  const target = new URL(GALLERY_ICON_PATH, root);
  const pixels = await renderGalleryIcon(root);
  if (process.argv.includes("--check")) {
    const committed = decodePng(await readFile(target));
    if (committed.width !== ICON_SIZE || committed.height !== ICON_SIZE || !committed.pixels.equals(pixels)) {
      console.error(`${GALLERY_ICON_PATH} is out of date. Run node scripts/build-gallery-icon.mjs.`);
      process.exit(1);
    }
    console.log(`${GALLERY_ICON_PATH} matches its drawing.`);
    return;
  }
  await writeFile(target, encodePng(pixels, ICON_SIZE, ICON_SIZE));
  console.log(`Wrote ${GALLERY_ICON_PATH}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
