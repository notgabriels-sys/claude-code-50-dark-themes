// Renders the theme packs' listing icon, assets/theme-packs-icon.svg, to the
// 1024 px logo.png each theme pack's plugin.json names as its "icon".
//
// Why it exists. The plugin directory keeps the first icon it is given, and the
// icon follows one of the 50 themes, Petrol: its accent and text on its
// terminal background, with green and blue from its matched terminal scheme.
// `verify` checks the shipped PNG's pixels against Petrol's files
// (LISTING_ICON_THEME in scripts/verify.mjs), so the PNG has to carry each
// colour exactly. Chromium draws the SVG onto an sRGB canvas, and
// this script writes the pixels itself as an 8-bit RGB PNG with nothing in it
// but IHDR, IDAT and IEND: no colour profile, no text, no time, which the
// listing-icon check refuses.
//
// Needs Playwright with Chromium, which CI does not have; nothing in CI runs
// this. Run it after changing the SVG:
//
//   node scripts/render-listing-icons.mjs

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { crc32, deflateSync } from "node:zlib";

const root = new URL("../", import.meta.url);
const SIZE = 1024;
const TARGETS = ["plugins/50-dark-themes/logo.png", "plugins/dark-themes-vol-2/logo.png"];

const { chromium } = createRequire(import.meta.url)("playwright");

const chunk = (type, body) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
};

// Each row takes the PNG filter whose output has the smallest sum of absolute
// values, the heuristic the PNG specification suggests.
const filterRows = (rgb, width, height) => {
  const stride = width * 3;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const line = rgb.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? rgb.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    let best;
    for (let type = 0; type <= 4; type++) {
      const out = Buffer.alloc(stride + 1);
      out[0] = type;
      let cost = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 3 ? line[x - 3] : 0;
        const b = above[x];
        const c = x >= 3 ? above[x - 3] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][type];
        out[x + 1] = (line[x] - predictor) & 0xff;
        cost += out[x + 1] < 128 ? out[x + 1] : 256 - out[x + 1];
      }
      if (!best || cost < best.cost) best = { out, cost };
    }
    rows.push(best.out);
  }
  return Buffer.concat(rows);
};

const svg = await readFile(new URL("assets/theme-packs-icon.svg", root), "utf8");
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent("<!doctype html><canvas></canvas>");
  const pixels = await page.evaluate(async ([source, size]) => {
    const image = new Image();
    image.src = `data:image/svg+xml;base64,${btoa(source)}`;
    await image.decode();
    const canvas = document.querySelector("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { colorSpace: "srgb" });
    context.drawImage(image, 0, 0, size, size);
    const rgba = context.getImageData(0, 0, size, size).data;
    const rgb = [];
    for (let i = 0; i < rgba.length; i += 4) rgb.push(rgba[i], rgba[i + 1], rgba[i + 2]);
    return rgb;
  }, [svg, SIZE]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(filterRows(Buffer.from(pixels), SIZE, SIZE), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  for (const target of TARGETS) {
    await writeFile(new URL(target, root), png);
    console.log(`Wrote ${target} (${png.length} bytes).`);
  }
} finally {
  await browser.close();
}
