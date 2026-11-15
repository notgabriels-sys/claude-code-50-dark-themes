// Renders the share card, assets/social-preview.html, to preview.png: the 1280 x 720 image every
// public page names as its og:image and twitter:image.
//
// The card wears assets/site.css and loads its fonts from assets/fonts, so it is served over a
// local HTTP server bound to 127.0.0.1 (a file:// page may not load fonts) and drawn by Chromium
// at a device scale of 1, dark, with reduced motion, once every font has loaded. `verify` checks
// the card (scripts/site-style.mjs, SHARE_CARDS) and that its strip is every theme's accent; it
// cannot check that preview.png was rendered from it, since CI's verify job has no browser.
//
// Needs Playwright with Chromium, which CI's verify job does not have. Run it after changing the
// card or a theme's accent:
//
//   node scripts/render-share-card.mjs

import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const CARD = "assets/social-preview.html";
const TARGET = "preview.png";
const TYPES = { ".html": "text/html", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml" };

const { chromium } = createRequire(import.meta.url)("playwright");

const server = createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname)).replace(/^\/+/, "");
  if (path.startsWith("..")) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(root + path);
    response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "reduce" });
  const offsite = [];
  page.on("request", (request) => {
    if (!request.url().startsWith(`http://127.0.0.1:${server.address().port}/`)) offsite.push(request.url());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/${CARD}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(() => ['600 82px "Familjen Grotesk"', '15px "IBM Plex Mono"'].filter((font) => !document.fonts.check(font)));
  if (missing.length) throw new Error(`The card's fonts did not load: ${missing.join(", ")}.`);
  if (offsite.length) throw new Error(`The card requested files from another host: ${offsite.join(", ")}.`);
  await writeFile(new URL(TARGET, `file://${root}`), await page.screenshot({ type: "png" }));
  console.log(`Wrote ${TARGET} from ${CARD}.`);
} finally {
  await browser.close();
  server.close();
}
