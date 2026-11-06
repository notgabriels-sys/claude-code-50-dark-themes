import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { crc32, deflateSync } from "node:zlib";

import {
  GALLERY_ICON_PATH,
  ICON_SIZE,
  decodePng,
  encodePng,
  iconColourProblems,
  loadFreeColours,
  renderGalleryIcon,
} from "./build-gallery-icon.mjs";

const root = new URL("../", import.meta.url);
// No free theme file uses it; the check must refuse it.
const FOREIGN = [0xff, 0x00, 0xff];

function paint(pixels, { x, y, size, colour }) {
  const copy = Buffer.from(pixels);
  for (let row = y; row < y + size; row += 1) {
    for (let column = x; column < x + size; column += 1) copy.set(colour, (row * ICON_SIZE + column) * 3);
  }
  return copy;
}

test("the committed gallery icon is the drawing the script makes", async () => {
  const committed = decodePng(await readFile(new URL(GALLERY_ICON_PATH, root)));
  assert.equal(committed.width, ICON_SIZE);
  assert.equal(committed.height, ICON_SIZE);
  assert.ok(
    committed.pixels.equals(await renderGalleryIcon(root)),
    `${GALLERY_ICON_PATH} is out of date. Run node scripts/build-gallery-icon.mjs.`,
  );
});

test("the gallery icon carries only free theme colours and the edges between them", async () => {
  const freeColours = await loadFreeColours(root);
  assert.equal([...freeColours.values()].flat().length, 62 * 13, "every override of the 62 free theme files is read");
  const committed = decodePng(await readFile(new URL(GALLERY_ICON_PATH, root)));
  assert.deepEqual(iconColourProblems(committed, freeColours), []);
});

test("a block in a colour no free theme uses is refused", async () => {
  const freeColours = await loadFreeColours(root);
  assert.ok(!freeColours.has("#FF00FF"), "the test colour must not be a free theme colour");
  const pixels = paint(await renderGalleryIcon(root), { x: 40, y: 40, size: 64, colour: FOREIGN });
  const problems = iconColourProblems({ width: ICON_SIZE, height: ICON_SIZE, pixels }, freeColours);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^#FF00FF covers 4096 pixels and is not a colour of any free theme file$/);
});

test("a detail too small to count as one of the icon's colours is refused too", async () => {
  const freeColours = await loadFreeColours(root);
  const pixels = paint(await renderGalleryIcon(root), { x: 40, y: 40, size: 6, colour: FOREIGN });
  const problems = iconColourProblems({ width: ICON_SIZE, height: ICON_SIZE, pixels }, freeColours);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^36 pixels, such as #FF00FF, are neither a free theme colour nor an edge/);
});

test("the PNG written for the icon reads back pixel for pixel", async () => {
  const pixels = await renderGalleryIcon(root);
  const decoded = decodePng(encodePng(pixels, ICON_SIZE, ICON_SIZE));
  assert.ok(decoded.pixels.equals(pixels));
});

// Image editors write adaptive row filters and alpha; the check must read
// what they write, not only what the script writes.
test("the decoder reads every row filter and skips transparent pixels", () => {
  const width = 3;
  const height = 5;
  const channels = 4;
  const image = Buffer.from(Array.from({ length: width * height * channels }, (_, index) => (index * 37 + 11) % 256));
  for (let index = 0; index < width * height; index += 1) image[index * channels + 3] = index === 4 ? 0 : 255;
  const stride = width * channels;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const filter = y; // 0 none, 1 sub, 2 up, 3 average, 4 Paeth
    const line = Buffer.alloc(stride + 1);
    line[0] = filter;
    for (let x = 0; x < stride; x += 1) {
      const value = image[y * stride + x];
      const left = x >= channels ? image[y * stride + x - channels] : 0;
      const up = y > 0 ? image[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? image[(y - 1) * stride + x - channels] : 0;
      const estimate = left + up - upLeft;
      const [toLeft, toUp, toUpLeft] = [left, up, upLeft].map((one) => Math.abs(estimate - one));
      const paeth = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      const predicted = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      line[x + 1] = (value - predicted) & 255;
    }
    rows.push(line);
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  const decoded = decodePng(png);
  for (let index = 0; index < width * height; index += 1) {
    assert.deepEqual(
      [...decoded.pixels.subarray(index * 3, index * 3 + 3)],
      [...image.subarray(index * channels, index * channels + 3)],
      `pixel ${index}`,
    );
    assert.equal(decoded.opaque[index], index === 4 ? 0 : 1, `alpha of pixel ${index}`);
  }
});

test("the decoder refuses what it cannot check", () => {
  assert.throws(() => decodePng(Buffer.from("not a png")), /not a PNG file/);
});
