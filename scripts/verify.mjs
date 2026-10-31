import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, stat } from "node:fs/promises";

import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, inflateSync } from "node:zlib";

import {
  ITEMLIST_END,
  ITEMLIST_START,
  buildThemeIndex,
  isThemeFile,
  serializeThemeIndex,
  serializeThemeItemList,
} from "./build-theme-index.mjs";
import { HTML_SPACE, htmlTags } from "./html-tags.mjs";

const root = new URL("../", import.meta.url);
const pluginRoot = new URL("../plugins/50-dark-themes/", import.meta.url);
const pluginThemesRoot = new URL("../plugins/50-dark-themes/themes/", import.meta.url);
// A path from disk as a URL: each segment encoded, so the name reaches the URL
// parser as text. Passed raw, a "#", "?", "%" or "\" in a name points at
// another file — a root page named "index.html#2.html" was read as index.html,
// so the price checks read the storefront while the link check read the page,
// and a EUR1 card for an EUR8 product shipped green.
const urlPath = (path) => path.split("/").map(encodeURIComponent).join("/");
const fileUrl = (path, base = root) => new URL(urlPath(path), base);
const requiredOverrideKeys = [
  "claude",
  "claudeShimmer",
  "inactive",
  "permission",
  "planMode",
  "promptBorder",
  "promptBorderShimmer",
  "rate_limit_fill",
  "subtle",
  "suggestion",
  "text",
  "userMessageBackground",
  "userMessageBackgroundHover",
].sort();
// Hosted IDs read back individually from paypal.com/ncp/links/<ID> on
// 2026-08-18, with the price each one actually charges. Both halves are
// enforced below: an unlisted link cannot ship, and a listed one cannot
// drift off its verified price. Never edit this table from a description --
// re-read the link's own detail page first. See CLAUDE.md.
const verifiedPayPalLinks = [
  { id: "3SWZ64EXW9C8W", price: "€45" },
  { id: "6Z93DNS76PCGS", price: "€160" },
  { id: "QW8V53WWM2P7E", price: "€190" },
];
const verifiedPayPalIds = verifiedPayPalLinks.map((link) => link.id);

// Buyer-side read-back on 2026-08-24 and 2026-08-25 confirmed these product pages
// return a
// published Gumroad product. A plausible URL or HTTP 200 is not enough:
// unpublished Gumroad products can still render a 200-status product shell.
//
// Note what this does and does not assert: the product EXISTS and is
// published. It says nothing about its price, currency or bundle contents.
// See recordedGumroadPrices below for that half, and read its warning.
const verifiedGumroadSlugs = new Set([
  "bqgfv",
  "bunkhy",
  "cfcvmy",
  "ckthsb",
  "dark-app-screens",
  "dark-invoice-business-documents",
  "industrial-tension-fx",
  "jqrdfy",
  "kxsfa",
  "kykega",
  "raw-techno-kick-architecture",
  "wgtbkq",
  "wuhehk",
  "xcxeb",
  "xjcbji",
]);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The price each product prints on the shop. Recorded 2026-08-24 against the
// page as it then stood, and re-recorded the same day after `main` restyled the
// cards ("View product · EUR12"), added a developer-picks row that repeats
// three products with UTM parameters, and retired `zvbti`.
//
// READ THIS BEFORE ADDING OR CHANGING A ROW. Three assertions live in this
// file and they are NOT equally strong:
//
//   verifiedPayPalLinks   = "a human opened paypal.com/ncp/links/<ID> and read
//                            this price back off the provider's own object."
//   verifiedGumroadSlugs  = "a human loaded this product page and it is a
//                            published product."  (existence, not price.)
//   recordedGumroadPrices = "this is what index.html said on 2026-08-24."
//
// The third asserts NOTHING about Gumroad. Claude has read back no Gumroad
// price in this repo; the only recorded read-back is industrial-tension-fx's
// EUR 15, in products/industrial-tension-fx/PUBLISHING.md, and it promotes
// nothing here -- see CLAUDE.md, "Gumroad -- the unverified half of the shop". A price that was already wrong on the day
// it was recorded is copied faithfully into this table and the build stays
// green forever.
//
// What it does buy is drift detection: a price cannot be edited on the page,
// in any of the three places the page now states it, without the edit being
// deliberate. That catches a stray keystroke or a bad merge, which is worth
// having. It is not verification and must never be described as verification.
//
// price null means the product states no price, as a name-your-price product
// does. None is on the shop now: the free zip `slhbym` was withdrawn on main in
// 6422979 and its row dropped here when that merged. `wuhehk` is the bundle, whose price is inline copy rather than a price
// element, so it is recorded here like any other.
//
// Two rows are in USD on an otherwise-EUR page (`cfcvmy` $19, `xcxeb` $9, and
// the bundle at $39). That inconsistency is recorded on purpose rather than
// smoothed over. Do NOT resolve it by editing index.html; it is resolved by
// reading the real products in a signed-in browser.
const recordedGumroadPrices = [
  { slug: "ckthsb", price: "€12" },
  { slug: "cfcvmy", price: "$19" },
  { slug: "dark-app-screens", price: "€14" },
  // Added to the shop by main on 2026-08-25.
  { slug: "dark-invoice-business-documents", price: "€12" },
  { slug: "xjcbji", price: "€9" },
  { slug: "bunkhy", price: "€9" },
  { slug: "kxsfa", price: "€7" },
  { slug: "kykega", price: "€7" },
  { slug: "wgtbkq", price: "€7" },
  { slug: "bqgfv", price: "€8" },
  { slug: "jqrdfy", price: "€6" },
  { slug: "xcxeb", price: "$9" },
  { slug: "wuhehk", price: "$39" },
  // Two retired audio products were removed from the shop on 2026-08-24
  // together with their whole product directories, and `zvbti` followed when
  // main refocused the storefront; the guard caught each disappearance and the
  // slugs are dropped deliberately, not to silence it.
  { slug: "raw-techno-kick-architecture", price: "€15" },
  { slug: "industrial-tension-fx", price: "€15" },
];
const recordedGumroadPriceBySlug = new Map(
  recordedGumroadPrices.map((entry) => [entry.slug, entry.price]),
);

// The two lists above are maintained by hand and describe the same shop, so a
// slug added to one and forgotten in the other is a silent gap in coverage.
for (const slug of verifiedGumroadSlugs) {
  if (!recordedGumroadPriceBySlug.has(slug)) {
    fail(`Gumroad slug "${slug}" is verified but has no row in recordedGumroadPrices.`);
  }
}
for (const { slug } of recordedGumroadPrices) {
  if (!verifiedGumroadSlugs.has(slug)) {
    fail(`Gumroad slug "${slug}" has a recorded price but is not in verifiedGumroadSlugs.`);
  }
}

// Currency amounts are read off human copy, so a trailing separator can be
// sentence punctuation rather than part of the number: "from €6, up to €8"
// yields "€6," unless it is trimmed, and the guard then rejects honest text.
// Found by a negative control on the README check below — the amount was
// correct and the guard failed it. A guard that fires on correct copy is worse
// than no guard, because it gets silenced. Thousands separators survive,
// because a trailing [.,] is only dropped when no digit follows it.
const AMOUNT_PATTERN = /[€$]\s?\d[\d.,]*/g;
const statedAmounts = (source) =>
  [...source.matchAll(AMOUNT_PATTERN)].map((match) =>
    match[0].replace(/\s+/g, "").replace(/[.,]+$/, ""),
  );

const GUMROAD_HOST = "notgabriel.gumroad.com";

function fail(message) {
  throw new Error(message);
}

async function verifyPng(imagePath, { label, width, height }) {
  let imageData;
  try {
    imageData = await readFile(fileUrl(imagePath));
  } catch {
    fail(`${label} is missing: ${imagePath}.`);
  }

  const hasValidPngHeader =
    imageData.length >= 24 &&
    imageData.subarray(0, pngSignature.length).equals(pngSignature) &&
    imageData.readUInt32BE(8) === 13 &&
    imageData.subarray(12, 16).equals(Buffer.from("IHDR"));
  if (!hasValidPngHeader) {
    fail(`${label} must be a valid PNG: ${imagePath}.`);
  }
  if (imageData.readUInt32BE(16) !== width || imageData.readUInt32BE(20) !== height) {
    fail(`${label} must be ${width}x${height}: ${imagePath}.`);
  }
}

// A plugin's listing icon is read whole, since the plugin directory keeps the
// first icon it is given. verifyPng reads only the header, so a file cut off
// after its first 24 bytes, an impossible bit depth, or a tEXt chunk carrying a
// name, an address and a home-directory path all passed (2026-10-24 review).
// Every chunk's CRC must hold; IHDR comes first, with 8-bit RGB or RGBA, no
// interlace and the only compression and filter methods PNG has; the image
// data must inflate to exactly the rows IHDR describes, each opening with a
// filter type PNG defines; IEND comes last and nothing follows it; and no
// chunk may carry text, EXIF, a time or a colour profile, which can name
// whoever made the file. Other images keep the header check: some product
// artwork carries EXIF, and it is not a listing icon.
const ICON_CHUNKS = new Set(["IHDR", "IDAT", "IEND", "sRGB", "gAMA", "cHRM", "pHYs"]);
const listingIconProblems = (bytes) => {
  const problems = [];
  let at = pngSignature.length;
  let header;
  const data = [];
  let ended = false;
  while (at < bytes.length && !ended) {
    if (at + 12 > bytes.length) {
      problems.push("a chunk cut off");
      break;
    }
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("latin1", at + 4, at + 8);
    if (at + 12 + length > bytes.length) {
      problems.push(`a ${type} chunk cut off`);
      break;
    }
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (crc32(bytes.subarray(at + 4, at + 8 + length)) !== bytes.readUInt32BE(at + 8 + length)) {
      problems.push(`a ${type} chunk whose CRC does not match`);
    }
    if (!ICON_CHUNKS.has(type)) problems.push(`a ${type} chunk`);
    if (at === pngSignature.length) {
      if (type === "IHDR" && length === 13) header = body;
      else problems.push("no IHDR first");
    }
    if (type === "IDAT") data.push(body);
    ended = type === "IEND";
    at += 12 + length;
  }
  if (!ended) problems.push("no IEND");
  else if (at !== bytes.length) problems.push(`${bytes.length - at} bytes after IEND`);
  if (!header) return problems;
  const [width, height] = [header.readUInt32BE(0), header.readUInt32BE(4)];
  const [depth, colour, compression, filter, interlace] = header.subarray(8, 13);
  if (depth !== 8 || ![2, 6].includes(colour) || compression !== 0 || filter !== 0 || interlace !== 0) {
    problems.push(`IHDR bit depth ${depth}, colour type ${colour}, compression ${compression}, filter ${filter}, interlace ${interlace}`);
    return problems;
  }
  let rows;
  try {
    rows = inflateSync(Buffer.concat(data));
  } catch {
    problems.push("image data that does not inflate");
    return problems;
  }
  const stride = 1 + width * (colour === 6 ? 4 : 3);
  if (rows.length !== height * stride) {
    problems.push(`image data of ${rows.length} bytes where IHDR describes ${height * stride}`);
  } else if (Array.from({ length: height }, (_, row) => rows[row * stride]).some((type) => type > 4)) {
    problems.push("a row with a filter type PNG does not define");
  }
  return problems;
};
// Reads one pixel of a listing icon that listingIconProblems found clean, as
// "#RRGGBB": the rows are unfiltered as PNG defines, each from the row above.
const pngPixels = (bytes) => {
  const data = [];
  let header;
  for (let at = pngSignature.length; at < bytes.length; at += 12 + bytes.readUInt32BE(at)) {
    const type = bytes.toString("latin1", at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + bytes.readUInt32BE(at));
    if (type === "IHDR") header = body;
    if (type === "IDAT") data.push(body);
  }
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const channels = header[9] === 6 ? 4 : 3;
  const stride = width * channels;
  const rows = inflateSync(Buffer.concat(data));
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      const guess = left + up - upLeft;
      const [toLeft, toUp, toUpLeft] = [left, up, upLeft].map((value) => Math.abs(guess - value));
      const paeth = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      const predictor = [0, left, up, (left + up) >> 1, paeth][filter];
      pixels[y * stride + x] = (rows[y * (stride + 1) + 1 + x] + predictor) & 0xff;
    }
  }
  return (x, y) =>
    `#${[0, 1, 2].map((i) => pixels[y * stride + x * channels + i].toString(16).padStart(2, "0")).join("").toUpperCase()}`;
};

const files = (await readdir(root)).filter(isThemeFile).sort();

if (files.length !== 50) {
  fail(`Expected 50 root-level theme files; found ${files.length}.`);
}

const names = new Set();
async function validateThemeFile(file, fileUrl) {
  const source = await readFile(fileUrl, "utf8");
  let theme;
  try {
    theme = JSON.parse(source);
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}`);
  }

  const topKeys = Object.keys(theme).sort();
  if (topKeys.join(",") !== "base,name,overrides") {
    fail(`${file} must contain exactly name, base, and overrides.`);
  }
  if (theme.base !== "dark") fail(`${file} must use the dark base theme.`);
  if (typeof theme.name !== "string" || !theme.name.trim()) {
    fail(`${file} has no display name.`);
  }
  if (names.has(theme.name)) fail(`Duplicate display name: ${theme.name}.`);
  names.add(theme.name);

  const overrideKeys = Object.keys(theme.overrides ?? {}).sort();
  if (overrideKeys.join(",") !== requiredOverrideKeys.join(",")) {
    fail(`${file} does not use the shared override-key contract.`);
  }
  for (const [key, value] of Object.entries(theme.overrides)) {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
      fail(`${file}: ${key} must be a six-digit hex colour; got ${value}.`);
    }
  }
  return theme;
}

for (const file of files) {
  await validateThemeFile(file, fileUrl(file));
}
// The storefront gallery covers the flagship 50; Vol. 2 names validated below
// share the uniqueness set but are not gallery cards.
const rootNames = new Set(names);

const pluginFiles = (await readdir(pluginThemesRoot))
  .filter((file) => file.endsWith(".json"))
  .sort();
if (pluginFiles.join(",") !== files.join(",")) {
  fail("The installable plugin theme list is not identical to the root theme list. Run node scripts/sync-plugin-themes.mjs.");
}
for (const file of files) {
  const source = await readFile(fileUrl(file), "utf8");
  const packaged = await readFile(fileUrl(file, pluginThemesRoot), "utf8");
  if (source !== packaged) {
    fail(`${file} differs from its plugin copy. Run node scripts/sync-plugin-themes.mjs.`);
  }
}

// ---------------------------------------------------------------------------
// Dark Themes Vol. 2 — the expansion pack lives only inside its plugin.
// ---------------------------------------------------------------------------
const vol2Root = new URL("../plugins/dark-themes-vol-2/", import.meta.url);
const vol2ThemesRoot = new URL("themes/", vol2Root);
const vol2Files = (await readdir(vol2ThemesRoot))
  .filter((file) => file.endsWith(".json"))
  .sort();
if (vol2Files.length === 0) fail("Dark Themes Vol. 2 must package at least one theme.");
const vol2PreviewSource = await readFile(new URL("previews.json", vol2Root), "utf8");
const vol2Previews = JSON.parse(vol2PreviewSource);
// JSON.parse keeps the last of two equal keys, so a row written twice shipped
// with the earlier colour unread (2026-10-24 review). previews.json is one flat
// object, so every quoted string before a colon is one of its keys.
const previewKeys = [...vol2PreviewSource.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)].map(([, key]) => JSON.parse(`"${key}"`));
const previewWrittenTwice = previewKeys.find((key, index) => previewKeys.indexOf(key) !== index);
if (previewWrittenTwice !== undefined) {
  fail(
    `plugins/dark-themes-vol-2/previews.json writes a preview colour for ${previewWrittenTwice} twice. JSON keeps ` +
      "only the last, so the other row ships unread; keep one.",
  );
}
const vol2ThemesByName = new Map();
for (const file of vol2Files) {
  const theme = await validateThemeFile(`dark-themes-vol-2/${file}`, fileUrl(file, vol2ThemesRoot));
  const preview = vol2Previews[theme.name];
  if (typeof preview !== "string" || !/^#[0-9a-f]{6}$/i.test(preview)) {
    fail(`Vol. 2 theme ${theme.name} needs a six-digit hex preview terminal colour in previews.json.`);
  }
  vol2ThemesByName.set(theme.name, theme);
}
// A preview colour for a theme the pack no longer ships passed: previews.json
// is read only by theme name, so a renamed or retired theme's row stayed.
const orphanPreviews = Object.keys(vol2Previews).filter((name) => !vol2ThemesByName.has(name));
if (orphanPreviews.length) {
  fail(
    `plugins/dark-themes-vol-2/previews.json has a preview colour for ${orphanPreviews.join(", ")}, ` +
      `which the pack does not ship; remove the row, or rename it to the theme's current name.`,
  );
}

const marketplace = JSON.parse(await readFile(new URL(".claude-plugin/marketplace.json", root), "utf8"));
const pluginManifest = JSON.parse(await readFile(new URL(".claude-plugin/plugin.json", pluginRoot), "utf8"));
const vol2Manifest = JSON.parse(await readFile(new URL(".claude-plugin/plugin.json", vol2Root), "utf8"));
if (marketplace.name !== "notgabriels-themes") fail("Unexpected marketplace name.");
// The addresses /plugin shows an installer ("Open homepage", "View
// repository") are pinned: a theme pack's homepage is its gallery on the
// domain CNAME serves, the skills plugin's is its README on GitHub, and every
// repository and author address is this repository and its owner. Each is
// compared as the exact string, so an array, a second host after a space, or
// any other page cannot pass (an array once did: Claude Code then refused to
// install the pack, with CI green).
const site = (await readFile(new URL("CNAME", root), "utf8")).trim();
const REPOSITORY_URL = "https://github.com/notgabriels-sys/claude-code-50-dark-themes";
const OWNER_URL = "https://github.com/notgabriels-sys";
// The theme packs also name the install guide and the issue tracker, for the
// plugin directory (main's #67); the skills plugin names neither.
const themePackLinks = {
  documentationUrl: `https://${site}/claude-code-theme-install-guide.html`,
  supportUrl: `${REPOSITORY_URL}/issues`,
};
const expectedPlugins = [
  { name: "50-dark-themes", source: "./plugins/50-dark-themes", homepage: `https://${site}/`, ...themePackLinks },
  {
    name: "dark-themes-vol-2", source: "./plugins/dark-themes-vol-2", homepage: `https://${site}/#vol2`,
    ...themePackLinks,
  },
  {
    name: "berlin-studio-skills", source: "./plugins/berlin-studio-skills",
    homepage: `${REPOSITORY_URL}/tree/main/plugins/berlin-studio-skills`,
  },
];
if (marketplace.owner?.url !== OWNER_URL) {
  fail(`.claude-plugin/marketplace.json's owner url must be exactly ${OWNER_URL}; found ${JSON.stringify(marketplace.owner?.url)}.`);
}
if (marketplace.plugins?.length !== expectedPlugins.length) {
  fail(`The marketplace must expose exactly ${expectedPlugins.length} plugins.`);
}
for (const [index, expected] of expectedPlugins.entries()) {
  const entry = marketplace.plugins[index];
  if (entry.name !== expected.name) {
    fail(`Unexpected marketplace plugin name at position ${index}: ${entry.name}.`);
  }
  if (entry.source !== expected.source) {
    fail(`Unexpected plugin source path for ${expected.name}: ${entry.source}.`);
  }
}
if (pluginManifest.name !== "50-dark-themes") fail("Unexpected plugin manifest name.");
if (pluginManifest.experimental?.themes !== "./themes/") fail("Plugin manifest must expose ./themes/.");
if (!/^\d+\.\d+\.\d+$/.test(pluginManifest.version)) fail("Plugin version must use semantic versioning.");
if (marketplace.plugins[0].version !== pluginManifest.version) {
  fail("Marketplace and plugin manifest versions must match.");
}
if (marketplace.plugins[1].name !== "dark-themes-vol-2") fail("Unexpected Vol. 2 marketplace plugin name.");
if (marketplace.plugins[1].source !== "./plugins/dark-themes-vol-2") fail("Unexpected Vol. 2 plugin source path.");
if (vol2Manifest.name !== "dark-themes-vol-2") fail("Unexpected Vol. 2 plugin manifest name.");
if (vol2Manifest.experimental?.themes !== "./themes/") fail("Vol. 2 plugin manifest must expose ./themes/.");
if (!/^\d+\.\d+\.\d+$/.test(vol2Manifest.version)) fail("Vol. 2 plugin version must use semantic versioning.");
if (marketplace.plugins[1].version !== vol2Manifest.version) {
  fail("Marketplace and Vol. 2 plugin manifest versions must match.");
}

// The skills live in .claude/skills/ (source of truth) and are mirrored
// into the plugin so they can be installed outside this repo. Drift between the
// two copies means an installer silently gets a different skill than a
// contributor reads, so it fails the build -- same contract as the themes.
const skillsManifest = JSON.parse(
  await readFile(
    new URL("../plugins/berlin-studio-skills/.claude-plugin/plugin.json", import.meta.url),
    "utf8",
  ),
);
if (skillsManifest.name !== "berlin-studio-skills") {
  fail("Unexpected skills plugin manifest name.");
}
const sourceSkillDir = new URL("../.claude/skills/", import.meta.url);
const packagedSkillDir = new URL("../plugins/berlin-studio-skills/skills/", import.meta.url);
const listSkills = async (dir) =>
  (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
const sourceSkills = await listSkills(sourceSkillDir);
const packagedSkills = await listSkills(packagedSkillDir);
if (sourceSkills.length === 0) fail("No skills found in .claude/skills/.");
if (sourceSkills.join("\u0000") !== packagedSkills.join("\u0000")) {
  fail("The packaged skill list differs from .claude/skills/. Run node scripts/sync-plugin-skills.mjs.");
}
// Compare EVERY file in a skill, not just SKILL.md. The sync used to copy the
// entry file alone, so a reference, script or asset added beside it was
// silently never packaged and this check — reading only SKILL.md — stayed
// green. Reproduced: adding references/kleinunternehmer.md to a source skill
// left the packaged copy holding SKILL.md alone with verify exiting 0, which
// ships an installer a skill whose own instructions point at a missing file.
// Every skill is SKILL.md-only today; the check is scoped to the rule so that
// stops being load-bearing.
const listSkillFiles = async (dir, name) => {
  const skillRoot = fileUrl(`${name}/`, dir);
  const found = [];
  for (const relative of await readdir(skillRoot, { recursive: true })) {
    const entry = await stat(fileUrl(relative.split(sep).join("/"), skillRoot));
    if (entry.isFile()) found.push(relative.split(sep).join("/"));
  }
  return found.sort();
};
for (const name of sourceSkills) {
  const sourceFiles = await listSkillFiles(sourceSkillDir, name);
  const packagedFiles = await listSkillFiles(packagedSkillDir, name);
  if (sourceFiles.join("\u0000") !== packagedFiles.join("\u0000")) {
    fail(
      `Skill ${name} packages [${packagedFiles.join(", ")}] but its source has ` +
        `[${sourceFiles.join(", ")}]. Run node scripts/sync-plugin-skills.mjs.`,
    );
  }
  if (!sourceFiles.includes("SKILL.md")) {
    fail(`Skill ${name} has no SKILL.md.`);
  }
  for (const file of sourceFiles) {
    const a = await readFile(fileUrl(`${name}/${file}`, sourceSkillDir), "utf8");
    const b = await readFile(fileUrl(`${name}/${file}`, packagedSkillDir), "utf8");
    if (a !== b) {
      fail(
        `Skill ${name}/${file} differs from its plugin copy. ` +
          `Run node scripts/sync-plugin-skills.mjs.`,
      );
    }
  }
  const original = await readFile(fileUrl(`${name}/SKILL.md`, sourceSkillDir), "utf8");
  if (!/^---\r?\n[\s\S]*?\bname:\s*\S/m.test(original)) {
    fail(`Skill ${name} is missing YAML frontmatter with a name.`);
  }
  if (!/^description:/m.test(original)) {
    fail(`Skill ${name} is missing a description in its frontmatter.`);
  }
}

// ---------------------------------------------------------------------------
// What a listing says must be what the package says. Every plugin's metadata
// is written twice — in its own plugin.json and again in its marketplace entry
// — and the checks above compared only name, source and version. Found live on
// 2026-09-02: berlin-studio-skills carried eight keywords in its manifest and
// six in the marketplace, and both described "Five skills" while six shipped;
// verify was green. A count written in prose rots the day the next thing is
// added, so the count is read back from what ships rather than trusted.
// ---------------------------------------------------------------------------
const NUMBER_WORDS = Object.fromEntries(
  [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen", "twenty",
  ].map((word, value) => [word, value]).concat([
    ["thirty", 30], ["forty", 40], ["fifty", 50], ["sixty", 60],
    ["seventy", 70], ["eighty", 80], ["ninety", 90],
  ]),
);
// "sixty-two" is a number word too; the storefront already writes
// "Forty-eight" in that style, and a bare-word table read "sixty-two themes"
// as "two themes" and "Twenty-six skills" as twenty. Written with a space,
// "sixty two", it is the same number.
const TENS = "twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety";
const UNITS = "one|two|three|four|five|six|seven|eight|nine";
const numberWordValue = (word) => {
  const lower = word.toLowerCase().replace(/\s+/g, " ");
  if (lower in NUMBER_WORDS) return NUMBER_WORDS[lower];
  const parts = new RegExp(`^(${TENS})[- ](${UNITS})$`).exec(lower);
  return parts ? NUMBER_WORDS[parts[1]] + NUMBER_WORDS[parts[2]] : undefined;
};
const countValue = (stated) => (/^\d/.test(stated) ? Number(stated) : numberWordValue(stated));
const numberWordPattern = `(?:${TENS})(?:-|\\s+)(?:${UNITS})|` + Object.keys(NUMBER_WORDS).join("|");
// A count is read only where nothing joins it to the text before: not a
// digit, a decimal point or a ratio ("WCAG 2.1", "7:1"), a thousands comma, a
// path, a currency sign ("the $9 palettes product"), an entity's end or a "#"
// ("#000"). A count never starts with 0 — "04 Switch themes" is a step
// badge, not four themes — and is not an ordinal: "2<sup>nd</sup> theme pack"
// reads as "2 nd theme pack" once its tags drop out.
const COUNT_START = "(?<![\\w.,:&;$€£#/-])";
const COUNT_NUMBER = `${numberWordPattern}|(?:[1-9]\\d{0,2}|0)(?!\\s*(?:st|nd|rd|th)\\b)`;
// Words that never sit between a count and its noun, because each means the
// number counts something else. An article, a partitive or a quantifier: "one
// of the themes", "every one of the palettes", "one or more themes", "90
// percent of themes", "9 roles across all themes". A demonstrative or a
// possessive: "two commands install these themes", "3 to check your own
// themes". A preposition: "pick 3 colours for your themes". A month: "on 19
// October, Vol. 2 themes". "one another", and a plural pack word: "two theme
// packs, 62 themes" counts packs. Only the word itself: "all-new", "on-brand"
// and "of-the-moment" are adjectives like any other.
const NOT_A_COUNT_WORD =
  "the|a|an|of|or|per|percent|all|every|each|across|another|" +
  "this|that|these|those|my|our|your|its|their|his|her|" +
  "for|in|on|at|to|by|from|with|without|into|onto|about|than|via|as|over|under|between|through|within|" +
  "packs|plugins|bundles|sets|" +
  "january|february|march|april|may|june|july|august|september|october|november|december|" +
  "jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
// An edition is one word between: in "the 13 Vol. 2 themes" the count is 13.
const EDITION = "Vol(?:ume)?\\.?\\s*\\d+";
// A word between holds a letter or a digit, so a bare "-" (a Markdown bullet,
// a spaced dash) is not one; accented letters count ("café-noir"), and so
// does a lone "&" ("dark & moody").
const BETWEEN_WORD = "(?=[\\p{L}\\p{N}_'-]*[\\p{L}\\p{N}])[\\p{L}\\p{N}_'-]+,?|&";
// "<number> <noun>", with up to five words between that are not themselves
// numbers: in "one of my 50 themes" the count bound to "themes" is 50.
// Any whitespace separates the words, line breaks included, since pages and
// notes wrap their lines. A word between may carry an apostrophe or end in a
// comma ("51 dark, hand-tuned themes"). A "+" after the number is part of the
// claim ("70+ themes"). The noun must end the word, so a file name such as
// themes.json is not a count of themes.
const countPattern = (nouns) =>
  new RegExp(
    `${COUNT_START}(${COUNT_NUMBER})\\+?` +
      `((?:\\s+(?:${EDITION}|(?!(?:${numberWordPattern}|\\d+)\\b|(?:${NOT_A_COUNT_WORD})(?![\\w'-]))(?:${BETWEEN_WORD}))){0,5})` +
      `\\s+(${nouns})\\b(?![./-]\\w)`,
    "giu",
  );
// A number joined to its noun by a hyphen: "the 12-theme expansion", "a
// seven-skill pack".
const compoundPattern = (nouns) =>
  new RegExp(`${COUNT_START}(${COUNT_NUMBER})-(?:${nouns})\\b(?![./-]\\w)`, "giu");
// The words a reader reads. A page is read as a browser lays it out: a tag
// drops out, so a count split by markup ("<dt>50</dt><dd>hand-tuned
// themes</dd>") is read whole. A tag leaves a space, since without the CSS
// nothing says whether "</span><span>" joins two words or lays them apart,
// and its line breaks stay, so a match can name its line. A comment and a
// style element are not read. A tag is read as the HTML tokenizer reads it: it
// opens only with "<" and a name followed by a space, "/" or ">", so "size <
// 200 KB" and "a<b" are text, and a quoted attribute value may hold a ">".
// What a browser shows or a crawler indexes from an attribute — a meta
// description, an og: or twitter: title, an image's alt, a title, an
// aria-label, aria-description or aria-roledescription, a placeholder — is
// read too, as a second text with the same lines, each tag's values on the
// line the tag opens, fenced by "|" so a count cannot bind across them. Kept
// apart from the visible text, a link's title cannot cut "thirteen <a
// title="…">more palettes</a>" in two. Entities are decoded, and one this list
// does not know becomes a mark no count reads across, not a space; a soft
// hyphen vanishes and a non-breaking hyphen is a hyphen. In Markdown, a link
// reads as its text, a reference or footnote mark drops out, a blockquote's
// ">" drops out, and emphasis and code marks drop out, since "**13**
// palettes" renders as "13 palettes". Dropping a mark only joins text: a
// number joined to a word before it is not read as a count.
const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
  shy: "", lsquo: "'", rsquo: "'", ldquo: "\u201c", rdquo: "\u201d", ndash: "\u2013", mdash: "\u2014",
  hellip: "\u2026", middot: "\u00b7",
};
const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (_, name) => {
    if (name[0] !== "#") return NAMED_ENTITIES[name.toLowerCase()] ?? "\ufffd";
    const code = /^#x/i.test(name) ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
  });
const READER_ATTRIBUTES =
  /\b(?:content|alt|title|aria-label|aria-description|aria-roledescription|placeholder)\s*=\s*("[^"]*"|'[^']*')/gi;
const READER_TAG = /<(?:!--[\s\S]*?-->|[!?][^>]*>|\/?([a-z][a-z0-9-]*)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>)/gi;
const readable = (text) =>
  decodeEntities(text)
    .replace(/\u00ad/g, "")
    .replace(/\u2011/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/^[ \t]*(?:>[ \t]?)+/gm, "")
    .replace(/\[\^[^\]\n]+\]/g, "")
    .replace(/!?\[([^\]\n]*)\]\[[^\]\n]*\]/g, "$1")
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/\*+|_+|`+|~~+/g, "");
// [the visible text, the attribute text]: both have the raw file's lines.
const proseText = (raw) => {
  const said = [];
  let line = 1;
  let seen = 0;
  const body = raw
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, (block) => block.replace(/[^\n]/g, ""))
    .replace(READER_TAG, (tag, name, offset, whole) => {
      line += whole.slice(seen, offset).split("\n").length - 1;
      seen = offset;
      const values = name ? [...tag.matchAll(READER_ATTRIBUTES)].map((m) => m[1].slice(1, -1).replace(/\s+/g, " ")) : [];
      if (values.length) said.push([line, values]);
      const breaks = tag.replace(/[^\n]/g, "");
      return ` ${breaks}`;
    });
  const lines = body.split("\n").map(() => []);
  for (const [at, values] of said) lines[at - 1].push(...values);
  const attributes = lines.map((values) => (values.length ? ` | ${values.join(" | ")} |` : "")).join("\n");
  return [readable(body), readable(attributes)];
};
const lineAt = (text, index) => text.slice(0, index).split("\n").length;
const statedCount = (text) => {
  const match = /^([A-Za-z]+(?:-[A-Za-z]+)?)\b/.exec(text.trim());
  return match ? numberWordValue(match[1]) : undefined;
};
const shippedCounts = {
  "50-dark-themes": files.length,
  "dark-themes-vol-2": vol2Files.length,
  "berlin-studio-skills": sourceSkills.length,
};
// Key allowlists, checked before the agreement comparison so that a component
// key gets this message rather than the agreement check's "make them agree".
// Why they exist is under "Exactly what ships" below.
const PLUGIN_METADATA_KEYS = [
  "author", "description", "displayName", "documentationUrl", "homepage", "icon", "keywords", "license",
  "name", "repository", "supportUrl", "version",
];
// Fields the plugin directory reads from plugin.json alone (main's #67): the
// marketplace schema does not know them, and `claude plugin validate --strict`
// (2.1.310) refuses them in a marketplace entry. So the agreement check skips
// them, and an entry may not carry them.
const MANIFEST_ONLY_KEYS = new Set(["experimental", "icon", "documentationUrl", "supportUrl"]);
const LISTING_ONLY_KEYS = ["category", "source", "tags"];
const themePluginNames = new Set(["50-dark-themes", "dark-themes-vol-2"]);
for (const [index, expected] of expectedPlugins.entries()) {
  const entry = marketplace.plugins[index];
  const manifest = JSON.parse(
    await readFile(new URL(`${expected.source}/.claude-plugin/plugin.json`, root), "utf8"),
  );
  const allowedManifestKeys = themePluginNames.has(expected.name)
    ? [...PLUGIN_METADATA_KEYS, "experimental"]
    : PLUGIN_METADATA_KEYS;
  for (const key of Object.keys(manifest)) {
    if (!allowedManifestKeys.includes(key)) {
      fail(
        `plugins/${expected.name}/.claude-plugin/plugin.json declares "${key}", which is not in ` +
          `PLUGIN_METADATA_KEYS. A key outside plugin metadata can declare a component (hooks, ` +
          `mcpServers, commands, ...) that Claude Code loads for every installer. Remove it, or ` +
          `add it to PLUGIN_METADATA_KEYS in scripts/verify.mjs deliberately once you have ` +
          `confirmed Claude Code treats it as metadata.`,
      );
    }
  }
  if (themePluginNames.has(expected.name) &&
      JSON.stringify(manifest.experimental) !== JSON.stringify({ themes: "./themes/" })) {
    fail(
      `plugins/${expected.name}/.claude-plugin/plugin.json must declare exactly ` +
        `"experimental": {"themes": "./themes/"}; found ${JSON.stringify(manifest.experimental)}.`,
    );
  }
  for (const key of Object.keys(entry)) {
    if (!PLUGIN_METADATA_KEYS.includes(key) && !LISTING_ONLY_KEYS.includes(key)) {
      fail(
        `The marketplace entry for ${expected.name} declares "${key}", which is in neither ` +
          `PLUGIN_METADATA_KEYS nor LISTING_ONLY_KEYS. A marketplace entry can declare components ` +
          `inline (mcpServers, hooks, ...) or stand in for the manifest ("strict"), and Claude ` +
          `Code applies them for every installer. Remove it, or add it to one of those lists in ` +
          `scripts/verify.mjs deliberately once you have confirmed it is metadata.`,
      );
    }
  }
  for (const key of Object.keys(entry)) {
    if (MANIFEST_ONLY_KEYS.has(key)) {
      fail(
        `The marketplace entry for ${expected.name} declares "${key}", which only plugin.json may carry; ` +
          "the marketplace schema does not know it and `claude plugin validate --strict` refuses it there.",
      );
    }
  }
  for (const [key, value] of Object.entries(manifest)) {
    if (MANIFEST_ONLY_KEYS.has(key)) continue;
    if (JSON.stringify(entry[key]) !== JSON.stringify(value)) {
      fail(
        `Marketplace entry for ${expected.name} disagrees with its plugin manifest on ${key}: ` +
          `listing ${JSON.stringify(entry[key])}, manifest ${JSON.stringify(value)}.`,
      );
    }
  }
  // The homepages read the github.io project address until 2026-10-24. The last
  // three are plugin.json's alone, and the skills plugin names no documentation
  // or support address.
  for (const [field, value, pinned, where] of [
    ["homepage", manifest.homepage, expected.homepage, "plugin.json and in its marketplace entry"],
    ["repository", manifest.repository, REPOSITORY_URL, "plugin.json and in its marketplace entry"],
    ["author url", manifest.author?.url, OWNER_URL, "plugin.json and in its marketplace entry"],
    ["documentation url", manifest.documentationUrl, expected.documentationUrl, "plugin.json"],
    ["support url", manifest.supportUrl, expected.supportUrl, "plugin.json"],
    ["icon", manifest.icon, "./logo.png", "plugin.json"],
  ]) {
    if (value !== pinned) {
      fail(
        `${expected.name}'s ${field} is ${JSON.stringify(value)}; it must be ` +
          `${pinned === undefined ? "absent" : `exactly ${pinned}`}, in ${where}. /plugin shows it to every installer.`,
      );
    }
  }
  const stated = statedCount(manifest.description ?? "");
  if (stated === undefined) {
    fail(`${expected.name}'s description must open with the number of things it ships, as a word.`);
  } else if (stated !== shippedCounts[expected.name]) {
    fail(`${expected.name} describes itself as shipping ${stated} but ${shippedCounts[expected.name]} ship.`);
  }
}
// The same count is stated in prose in the READMEs. Any "<number> skills"
// there must be the shipped number, not the number on the day it was written.
// The number may be a digit: this read words only, so "5 skills" passed.
// Only the READMEs state the count that ships; measured 2026-10-19, every
// other "<number> skills" on a served file counts another set ("Five skills
// referenced but missing", in the dated tooling audit).
// Each README must state the count somewhere verify reads it, or a rewording
// into a form it does not read ("a seven-skill pack", "[Seven](#skills)")
// would quietly end the check.
const skillCountPattern = countPattern("skills");
const skillCompoundPattern = compoundPattern("skills?");
for (const readme of ["README.md", "plugins/berlin-studio-skills/README.md"]) {
  const texts = proseText(await readFile(new URL(readme, root), "utf8"));
  const matches = texts.flatMap((text) =>
    [...text.matchAll(skillCountPattern), ...text.matchAll(skillCompoundPattern)].map((match) => [text, match]),
  );
  if (!matches.length) {
    fail(
      `${readme} no longer states how many skills ship in a form verify reads; keep "<number> skills" ` +
        `in it, so the count is checked against the ${sourceSkills.length} that ship.`,
    );
  }
  const stale = matches
    .filter(([, match]) => countValue(match[1]) !== sourceSkills.length)
    .map(([text, match]) => `${readme}:${lineAt(text, match.index)} says "${match[0].replace(/\s+/g, " ")}"`);
  if (stale.length) {
    fail(
      `${stale.join("; ")} but ${sourceSkills.length} skills ship. If a number counts some of them, ` +
        `name them instead ("these skills pair well") rather than putting a number before "skills".`,
    );
  }
}
// And the plugin README's skill table lists exactly the skills that ship, so
// a sixth skill cannot be installed while the table lists five, and a removed
// one cannot stay listed. This was an includes() over the whole file and then
// a line regex: a row could go missing while prose elsewhere named the skill,
// and a row for a removed skill passed in ordinary spellings (no leading pipe,
// a link, bold, no backticks, two names in a cell, HTML). The table is now read
// as GitHub renders it, and was checked differentially against cmark-gfm and
// pandoc on 2026-10-19: of 1,069 README variants, none was accepted while the
// rendered table listed anything but the shipped skills, where the old checks
// accepted 852. Lines the renderers disagree on — a pipe-less line, a quote,
// list, HTML or indented line straight after the table — are refused rather
// than guessed; end the table with a blank line.
const readSkillTable = (markdown) => {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  // Fenced code is not a table, whatever it holds.
  let fence = null;
  const visible = lines.map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && marker[2].trim() === "") {
        fence = null;
      }
      return "";
    }
    if (marker && !(marker[1][0] === "`" && marker[2].includes("`"))) {
      fence = marker[1];
      return "";
    }
    return line;
  });
  const definitions = new Set(
    [...markdown.matchAll(/^ {0,3}\[([^\]\n]+)\]:/gm)].map((match) => match[1].trim().toLowerCase()),
  );
  // A row's cells: an optional leading pipe, then text up to each unescaped pipe.
  const cells = (line) => {
    let text = line.replace(/^ {0,3}/, "");
    if (text.startsWith("|")) text = text.slice(1);
    const out = [];
    let cell = "";
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === "\\" && text[i + 1] === "|") {
        cell += "\\|";
        i += 1;
      } else if (text[i] === "|") {
        out.push(cell);
        cell = "";
      } else {
        cell += text[i];
      }
    }
    if (cell.trim() !== "" || out.length === 0) out.push(cell);
    return out;
  };
  const hasPipe = (line) => /(?:^|[^\\])\|/.test(line);
  const delimiterRow = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
  // GitHub ends a table where another block opens; pandoc reads that line as a row.
  const opensBlock =
    /^ {0,3}(?:#{1,6}(?:[ \t]|$)|>|[-+*][ \t]|\d{1,9}[.)][ \t]|`{3}|~{3}|<|(?:[-*_][ \t]*){3,}$)|^(?: {4}|\t)/;
  // What a reader sees in a cell: entities decoded, tags and link syntax gone
  // (a reference link only when it is defined), code and emphasis marks
  // dropped, a backslash-escaped mark kept as the mark.
  const plain = (cell) => {
    const text = decodeEntities(cell)
      .replace(/<[^>]*>/g, "")
      .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
      .replace(/!?\[([^\]\n]*)\]\[([^\]\n]*)\]/g, (all, label, ref) =>
        definitions.has((ref || label).trim().toLowerCase()) ? label : all);
    let out = "";
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === "\\" && /[!-/:-@[-`{-~]/.test(text[i + 1] ?? "")) {
        out += text[i + 1];
        i += 1;
      } else if (!"`*_~".includes(text[i])) {
        out += text[i];
      }
    }
    return out.replace(/[\s\u00a0]+/g, " ").trim();
  };
  for (let i = 0; i + 1 < visible.length; i += 1) {
    if (!hasPipe(visible[i]) || !delimiterRow.test(visible[i + 1])) continue;
    const header = cells(visible[i]);
    if (cells(visible[i + 1]).length !== header.length || plain(header[0]) !== "Skill") continue;
    const rows = [];
    const unclear = [];
    for (let j = i + 2; j < visible.length && visible[j].trim() !== ""; j += 1) {
      if (!hasPipe(visible[j]) || opensBlock.test(visible[j])) unclear.push(j + 1);
      else rows.push({ line: j + 1, name: plain(cells(visible[j])[0]) });
    }
    return { rows, unclear };
  }
  return null;
};
const skillsReadmePath = "plugins/berlin-studio-skills/README.md";
const skillsReadme = await readFile(fileUrl(skillsReadmePath), "utf8");
const skillTable = readSkillTable(skillsReadme);
if (!skillTable) {
  fail(
    `${skillsReadmePath} has no table whose header's first cell reads "Skill"; it must list the ` +
      `skills the plugin ships in one, a row per skill.`,
  );
}
const skillTableProblems = skillTable.unclear.map(
  (line) =>
    `${skillsReadmePath}:${line} follows the skill table with no blank line between, and GitHub and ` +
      `other renderers disagree on whether it is a row; end the table with a blank line`,
);
const listedSkills = new Set();
for (const { line, name } of skillTable.rows) {
  if (!sourceSkills.includes(name)) {
    skillTableProblems.push(
      `${skillsReadmePath}:${line} lists "${name}" in its skill table, which is not a skill the plugin ` +
        `ships; each row's first cell must name exactly one shipped skill (remove the row, or add the ` +
        `skill to .claude/skills/ and sync)`,
    );
  } else if (listedSkills.has(name)) {
    skillTableProblems.push(`${skillsReadmePath}:${line} lists ${name} a second time`);
  }
  listedSkills.add(name);
}
for (const name of sourceSkills) {
  if (!listedSkills.has(name)) {
    skillTableProblems.push(`${skillsReadmePath} does not list the packaged skill ${name} in its skill table`);
  }
}
if (skillTableProblems.length) fail(`${skillTableProblems.join("; ")}.`);

// ---------------------------------------------------------------------------
// Exactly what ships, and nothing else. `claude plugin install` copies every
// file in a plugin's directory, and Claude Code then loads whatever components
// it finds at the plugin root — hooks/hooks.json, commands/, agents/, skills/,
// .mcp.json, .lsp.json, output-styles/ — plus any component a plugin.json or a
// marketplace entry declares inline (mcpServers, hooks, commands, ...). Nothing
// above looked at either. Reproduced 2026-10-18 against claude 2.1.302, offline
// with a scratch HOME: a SessionStart hook dropped into
// plugins/50-dark-themes/hooks/ shipped with verify green and ran its command
// for the installer of a theme pack; an "mcpServers" key added to the
// marketplace entry alone did the same with no new file at all, because the
// agreement check above iterates the manifest's keys and never the listing's.
//
// Both are allowlists, deliberately. A deny-list of component paths and keys
// goes stale the day Claude Code adds a new auto-discovered component type; an
// allowlist fails closed. The keys are checked in the agreement loop above.
// The expected file sets come from the sources of truth this file already
// trusts — the root theme files, the Vol. 2 theme files validated one by one
// above, and .claude/skills — never from the packaged directory being checked,
// and every expected file must be present as well as nothing else. (For Vol. 2
// the packaged directory IS the source, so its themes/ set is only as strong as
// the per-file validation, previews.json, the gallery parity and the count
// checks applied to it.)
//
// The walk reads the checkout, and an installer does not get the checkout. A
// git submodule is an empty directory in CI's checkout, but Claude Code's
// marketplace clone runs `git submodule update --init` for submodules under a
// plugin path. Reproduced 2026-10-18 by the review of this guard, offline
// against a local git server: a submodule at plugins/50-dark-themes/hooks kept
// verify green on a plain clone, and the installed plugin reported
// "Hooks (1) SessionStart". So a .gitmodules file fails, and so does any empty
// directory under plugins/ — git checks one out only as a submodule placeholder.
// ---------------------------------------------------------------------------
if (await stat(new URL(".gitmodules", root)).then(() => true, () => false)) {
  fail(
    ".gitmodules exists. Claude Code's marketplace clone fetches submodules under a plugin " +
      "path and CI's checkout does not, so their files would ship unchecked. Vendor the " +
      "files instead.",
  );
}

// Files. Walk with lstat semantics (withFileTypes, no recursive option) so a
// symlink is reported rather than followed, and resolve each name with
// encodeURIComponent so a "#" or "?" in a stray name cannot redirect the walk.
const pluginsDir = new URL("../plugins/", import.meta.url);
const walkPackage = async (dirUrl, shownPath) => {
  const found = [];
  let entries;
  try {
    entries = await readdir(dirUrl, { withFileTypes: true });
  } catch (error) {
    fail(
      `${shownPath} could not be read (${error.code}); a directory name that is not valid ` +
        `UTF-8 does this. Rename or delete it.`,
    );
  }
  if (entries.length === 0) {
    fail(
      `${shownPath} is an empty directory. Git checks out an empty directory only as a ` +
        `submodule placeholder, which Claude Code fetches for installers and CI never sees. ` +
        `Delete it.`,
    );
  }
  for (const entry of entries) {
    const path = `${shownPath}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      fail(`${path} is a symlink. A plugin ships copies of real files; replace it or delete it.`);
    } else if (entry.isDirectory()) {
      found.push(...(await walkPackage(fileUrl(`${entry.name}/`, dirUrl), path)));
    } else {
      found.push(path);
    }
  }
  return found;
};
const skillPackageFiles = [];
for (const name of sourceSkills) {
  for (const file of await listSkillFiles(sourceSkillDir, name)) {
    skillPackageFiles.push(`skills/${name}/${file}`);
  }
}
const packageBasics = [".claude-plugin/plugin.json", "LICENSE", "README.md", "logo.png"];
const expectedPackageFiles = new Map([
  ["50-dark-themes", [...packageBasics, ...files.map((file) => `themes/${file}`)]],
  ["dark-themes-vol-2", [
    ...packageBasics, "preview.png", "previews.json", ...vol2Files.map((file) => `themes/${file}`),
  ]],
  ["berlin-studio-skills", [...packageBasics, ...skillPackageFiles]],
]);
if (JSON.stringify([...expectedPackageFiles.keys()].sort()) !==
    JSON.stringify(expectedPlugins.map((plugin) => plugin.name).sort())) {
  fail("expectedPackageFiles in scripts/verify.mjs must name exactly the plugins in expectedPlugins.");
}
// Each plugin carries the square PNG the official plugin directory takes as its
// listing icon, named by plugin.json's "icon". Read 2026-10-24 from Claude Code
// 2.1.310's `claude plugin validate --profile directory`: 512 to 2048 px a
// side, under 2 MB, PNG or JPEG, and the directory keeps the first icon it is
// given, so a wrong one cannot be replaced later. Main's #67 gave both theme
// packs the setup assistant's square logo, since 2026-10-24 drawn in Petrol's
// colours (LISTING_ICON_THEME, below); the skills plugin's is a meter in VU
// Meter's green, red and grey, with an amber band of its own.
for (const plugin of expectedPlugins) {
  const icon = `plugins/${plugin.name}/logo.png`;
  await verifyPng(icon, { label: `${plugin.name}'s listing icon`, width: 1024, height: 1024 });
  const { size } = await stat(fileUrl(icon));
  if (size >= 2 * 1024 * 1024) {
    fail(`${icon} is ${size} bytes; the plugin directory takes a listing icon under 2 MB.`);
  }
  const problems = listingIconProblems(await readFile(fileUrl(icon)));
  if (problems.length) {
    fail(
      `${icon} is not a clean 1024 px PNG: ${problems.join("; ")}. Export it again as an 8-bit RGB or ` +
        `RGBA PNG, not interlaced, with no text, EXIF, time or colour-profile chunk.`,
    );
  }
}
for (const entry of await readdir(pluginsDir, { withFileTypes: true })) {
  const path = `plugins/${entry.name}`;
  if (entry.isSymbolicLink()) {
    fail(`${path} is a symlink. A plugin ships copies of real files; replace it or delete it.`);
  } else if (!entry.isDirectory()) {
    fail(`${path} is a file; plugins/ holds only plugin directories. Delete it (a Finder .DS_Store included).`);
  } else if (!expectedPackageFiles.has(entry.name)) {
    fail(
      `${path} is not one of the registered plugins ` +
        `(${[...expectedPackageFiles.keys()].join(", ")}). Delete it, or register it in ` +
        `.claude-plugin/marketplace.json and in expectedPlugins, shippedCounts, ` +
        `expectedPackageFiles and releasedPackages in scripts/verify.mjs (and themePluginNames ` +
        `if it ships themes).`,
    );
  }
}
for (const [name, expectedFiles] of expectedPackageFiles) {
  const allowed = new Set(expectedFiles.map((file) => `plugins/${name}/${file}`));
  const shipped = await walkPackage(fileUrl(`${name}/`, pluginsDir), `plugins/${name}`);
  for (const path of allowed) {
    if (!shipped.includes(path)) fail(`${path} is missing from the ${name} package.`);
  }
  for (const path of shipped) {
    if (!allowed.has(path)) {
      fail(
        `${path} is not part of the ${name} package. Claude Code installs every file in a ` +
          `plugin directory and loads any hooks, commands, skills, agents or MCP servers it ` +
          `finds there. Delete it (an untracked .DS_Store or editor swap file included), or ` +
          `add it to expectedPackageFiles in scripts/verify.mjs deliberately.`,
      );
    }
  }
}
// The theme counts are stated in words too — "Fifty atmospheres", "twelve new
// atmospheres", "twelve additional dark themes", "twelve all-new palettes" —
// across the storefront, llms.txt, the READMEs and the notes Pages renders, and
// the description guard
// above reads only the plugin descriptions. That is the exact shape of the
// "Five skills" rot: when the pack grows, the description is forced to move
// and the prose is not. So every "<number> … themes|palettes|atmospheres"
// claim on a public surface must be a count that ships: the flagship pack,
// Vol. 2, or the two together. Plural nouns only — "one step above the theme"
// is not a count — and a digit directly after "Vol." is an edition number,
// not a count ("Vol. 2 themes"), which a bare digit scan reads as 2 themes.
// "A 51 theme pack" is a pack of 51, but "one theme pack" is one pack, and
// "two theme packs" counts packs, so a pack or set is read only in the
// singular and never after "one".
const shippedThemeCounts = new Set([files.length, vol2Files.length, files.length + vol2Files.length]);
const themeNouns = "theme\\s+files|theme\\s+pack|theme\\s+set|themes|palettes|atmospheres";
const themeCountPattern = countPattern(themeNouns);
const themeCompoundPattern = compoundPattern("themes?|palettes?|atmospheres?");
// "50 + 12 themes" and "50 and 12 themes" state both pack sizes; the first
// number is joined to the noun only through the second. A "/" is not a pair:
// "1/" numbers a post in a thread.
const pairedCount = new RegExp(`(?:^|[^\\w.,:&;$€£#/-])(${COUNT_NUMBER})(?:\\s*[+&]\\s*|\\s+and\\s+)$`, "iu");
// Read below, once the served set is known, on the files that state the packs'
// size to a reader. Every stale count in a file is listed in one message.
// It reads each of a file's texts: the visible text and the attribute text.
const themeCountFailure = (surface, texts) => {
  const stale = [];
  for (const text of texts) {
    const check = (match, counts, shown) => {
      if (counts.some((count) => !shippedThemeCounts.has(count))) {
        stale.push(`${surface}:${lineAt(text, match.index)} says "${shown.replace(/\s+/g, " ")}"`);
      }
    };
    for (const match of text.matchAll(themeCountPattern)) {
      const before = text.slice(Math.max(0, match.index - 24), match.index);
      if (/\bVol(?:ume)?s?\.?\s*(?:\d+\s*(?:and|&|\+|,)\s*)?$/i.test(before)) continue;
      // "70 VS Code themes" is a claim about a different product, not this pack.
      if (/\bVS\s*Code\b|\bVisual\s+Studio\s+Code\b/i.test(match[2])) continue;
      if (/^theme\s+(?:pack|set)$/i.test(match[3]) && countValue(match[1]) === 1) continue;
      const pair = pairedCount.exec(before);
      if (pair) {
        const from = before.length - pair[0].length + pair[0].indexOf(pair[1]);
        check(match, [countValue(match[1]), countValue(pair[1])], before.slice(from) + match[0]);
      } else {
        check(match, [countValue(match[1])], match[0]);
      }
    }
    for (const match of text.matchAll(themeCompoundPattern)) check(match, [countValue(match[1])], match[0]);
  }
  if (!stale.length) return undefined;
  return (
    `${stale.join("; ")} but the packs ship ${files.length} + ${vol2Files.length} themes. If one counts ` +
    `something else, write it without a number within five words before the noun.`
  );
};

const html = await readFile(new URL("index.html", root), "utf8");
const readme = await readFile(new URL("README.md", root), "utf8");
const publicHtmlFiles = (await readdir(root))
  .filter((file) => file.endsWith(".html"))
  .sort();
const normalizeHtmlText = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
for (const link of html.matchAll(/<a\b[^>]*\baria-label="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
  const accessibleName = normalizeHtmlText(link[1]);
  const visibleLabel = normalizeHtmlText(link[2]);
  if (visibleLabel && !accessibleName.toLocaleLowerCase().includes(visibleLabel.toLocaleLowerCase())) {
    fail(`Sales-link accessible name must include its visible label: ${visibleLabel}.`);
  }
}
const storefrontContracts = [
  [/<a class="skip-link" href="#main-content">/, "keyboard skip link"],
  [/<main id="main-content">/, "main landmark"],
  [/<h3 class="tname">\$\{esc\(name\)\}<\/h3>/, "gallery-card headings"],
  // The footer, the install guide and README tell readers to set the terminal
  // background to the hex the gallery shows; the card's template must print it,
  // and the two rules that colour and show it are held too, so a restyle that
  // hides it is a deliberate edit. A later rule could still override them.
  [/<a class="bg-link" href="\/theme\/\$\{themeSlug\}\/">Terminal background <span class="bghex">\$\{bg\}<\/span>/, "gallery-card terminal background"],
  [/\.term \.bg-link\{display:inline-flex;[^}]*color:var\(--mut\)/, "terminal-background row style"],
  [/\.term \.bghex\{color:var\(--fg\)/, "terminal-background hex colour"],
  [/<span class="sr-only" id="copyStatus" aria-live="polite"><\/span>/, "copy-status live region"],
  [/<meta property="og:image:alt" content="[^"]+">/, "Open Graph image alternative"],
  [/<meta name="twitter:image:alt" content="[^"]+">/, "X image alternative"],
];
const missingStorefrontContracts = storefrontContracts
  .filter(([pattern]) => !pattern.test(html))
  .map(([, label]) => label);
if (missingStorefrontContracts.length) {
  fail(`Storefront contract is missing: ${missingStorefrontContracts.join(", ")}.`);
}
const mainLandmarks = html.match(/<main(?:\s|>)/g) ?? [];
if (mainLandmarks.length !== 1) {
  fail(`The storefront must contain exactly one main landmark; found ${mainLandmarks.length}.`);
}
const structuredDataMatch = html.match(
  /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/,
);
if (!structuredDataMatch) fail("The storefront must expose JSON-LD software metadata.");
let structuredData;
try {
  structuredData = JSON.parse(structuredDataMatch[1]);
} catch (error) {
  fail(`The storefront JSON-LD is invalid: ${error.message}`);
}
const structuredSoftware = structuredData["@graph"]?.find(
  (entry) => entry["@type"] === "SoftwareApplication",
);
if (!structuredSoftware) fail("The storefront JSON-LD must describe the theme plugin.");
if (structuredSoftware.softwareVersion !== pluginManifest.version) {
  fail(
    `Storefront softwareVersion ${structuredSoftware.softwareVersion} does not match plugin version ${pluginManifest.version}.`,
  );
}
const currentDownloadUrls = new Set([
  `https://github.com/notgabriels-sys/claude-code-50-dark-themes/releases/tag/themes-plugin-v${pluginManifest.version}`,
  "https://github.com/notgabriels-sys/claude-code-50-dark-themes/archive/refs/heads/main.zip",
]);
if (!currentDownloadUrls.has(structuredSoftware.downloadUrl)) {
  fail(`Storefront downloadUrl is stale or unrelated: ${structuredSoftware.downloadUrl}.`);
}
const match = html.match(/const THEMES = (\[[\s\S]*?\n\]);/);
if (!match) fail("Could not find the THEMES array in index.html.");

let galleryThemes;
try {
  galleryThemes = JSON.parse(match[1]);
} catch (error) {
  fail(`The gallery theme array is not valid JSON data: ${error.message}`);
}
if (galleryThemes.length !== 50) {
  fail(`Expected 50 gallery cards; found ${galleryThemes.length}.`);
}
const galleryNames = new Set(galleryThemes.map(([name]) => name));
for (const name of rootNames) {
  if (!galleryNames.has(name)) fail(`Gallery is missing the ${name} theme.`);
}

// The theme packs' listing icon follows one of the 50 themes (Gabriel,
// 2026-10-24: "It needs to follow one of our themes for claude code. Probably
// something dark blueish or bluegreen?"). Both packs carry the one icon, so the
// Vol. 2 listing wears a theme from the 50. Each part is one of the theme's
// colours, read here from the theme's own files rather than from whatever drew
// the icon, so a retuned theme turns the icon red until it is drawn again: the
// ground is its recommended terminal background (its gallery row), the chevron
// its text and the top chip its claude accent (its theme file), and the middle
// and bottom chips its matched terminal bright green and blue (ANSI 10 and 4,
// from its Ghostty scheme; the theme file sets no green or blue). Each part is
// read at its centre in the 512-unit drawing, doubled, in the shipped PNG and
// in the SVG it is drawn from.
const LISTING_ICON_THEME = "Petrol";
const LISTING_ICON_SOURCE = "assets/theme-packs-icon.svg";
{
  const row = galleryThemes.find(([name]) => name === LISTING_ICON_THEME);
  const theme = JSON.parse(
    await readFile(fileUrl(`${LISTING_ICON_THEME.toLowerCase().replace(/ /g, "-")}.json`), "utf8"),
  );
  const scheme = await readFile(fileUrl(`terminal-schemes/ghostty/Gabs ${LISTING_ICON_THEME}`), "utf8");
  const ansi = (n) => scheme.match(new RegExp(`^palette = ${n}=(#[0-9A-Fa-f]{6})$`, "m"))?.[1]?.toUpperCase();
  const parts = [
    ["ground", [[16, 16], [1007, 1007]], row?.[5]?.toUpperCase(), "recommended terminal background, its gallery row"],
    ["chevron", [[334, 432]], theme.overrides.text.toUpperCase(), "text"],
    ["top chip", [[640, 333]], theme.overrides.claude.toUpperCase(), "claude accent"],
    ["middle chip", [[640, 512]], ansi(10), "terminal bright green, ANSI 10"],
    ["bottom chip", [[640, 691]], ansi(4), "terminal blue, ANSI 4"],
  ];
  for (const [part, , want, role] of parts) {
    if (!want) fail(`${LISTING_ICON_THEME} has no ${role} for the listing icon's ${part} to follow.`);
  }
  const drawn = [...(await readFile(fileUrl(LISTING_ICON_SOURCE), "utf8")).matchAll(/(?:fill|stroke)="([^"]*)"/g)]
    .map(([, value]) => value.toUpperCase())
    .filter((value) => value !== "NONE");
  if (JSON.stringify(drawn) !== JSON.stringify(parts.map(([, , want]) => want))) {
    fail(
      `${LISTING_ICON_SOURCE} draws ${drawn.join(", ")}; following ${LISTING_ICON_THEME} (LISTING_ICON_THEME in ` +
        `scripts/verify.mjs), its ground, chevron and three chips must be ${parts.map(([, , want]) => want).join(", ")}, ` +
        "in that order.",
    );
  }
  for (const name of themePluginNames) {
    const icon = `plugins/${name}/logo.png`;
    const bytes = await readFile(fileUrl(icon));
    if (listingIconProblems(bytes).length) continue;
    const pixel = pngPixels(bytes);
    for (const [part, points, want, role] of parts) {
      for (const [x, y] of points) {
        if (pixel(x, y) !== want) {
          fail(
            `${icon} follows ${LISTING_ICON_THEME} (LISTING_ICON_THEME in scripts/verify.mjs), so its ${part} at ` +
              `${x},${y} must be ${want}, ${LISTING_ICON_THEME}'s ${role}; it is ${pixel(x, y)}. Set ` +
              `${LISTING_ICON_SOURCE} to the theme's colours and draw it again with node scripts/render-listing-icons.mjs.`,
          );
        }
      }
    }
  }
}

// The Vol. 2 storefront section must mirror the packaged expansion exactly.
const vol2GalleryMatch = html.match(/const VOL2_THEMES = (\[[\s\S]*?\n\]);/);
if (!vol2GalleryMatch) fail("Could not find the VOL2_THEMES array in index.html.");
let vol2Gallery;
try {
  vol2Gallery = JSON.parse(vol2GalleryMatch[1]);
} catch (error) {
  fail(`The Vol. 2 gallery array is not valid JSON data: ${error.message}`);
}
if (vol2Gallery.length !== vol2Files.length) {
  fail(`Expected ${vol2Files.length} Vol. 2 gallery cards; found ${vol2Gallery.length}.`);
}
const vol2GalleryNames = new Set(vol2Gallery.map(([name]) => name));
if (vol2GalleryNames.size !== vol2Gallery.length) fail("Vol. 2 gallery names must be unique.");
for (const [name, claude, claudeShimmer, text, inactive, terminal] of vol2Gallery) {
  const theme = vol2ThemesByName.get(name);
  if (!theme) fail(`Vol. 2 gallery card ${name} has no packaged theme.`);
  const expected = { claude, claudeShimmer, text, inactive };
  for (const [token, value] of Object.entries(expected)) {
    if (theme.overrides[token].toLowerCase() !== value.toLowerCase()) {
      fail(`Vol. 2 gallery ${name}: ${token} ${value} does not match theme ${theme.overrides[token]}.`);
    }
  }
  if (vol2Previews[name].toLowerCase() !== terminal.toLowerCase()) {
    fail(`Vol. 2 gallery ${name}: terminal ${terminal} does not match previews.json ${vol2Previews[name]}.`);
  }
}
for (const name of vol2ThemesByName.keys()) {
  if (!vol2GalleryNames.has(name)) fail(`Vol. 2 gallery is missing the ${name} theme.`);
}
if (!html.includes("claude plugin install dark-themes-vol-2@notgabriels-themes")) {
  fail("The gallery must expose the Vol. 2 install command.");
}

// ---------------------------------------------------------------------------
// The "Start here" row in index.html names five themes and a measured contrast
// ratio for each; scripts/build-quick-picks.mjs chooses and words them from
// the theme files. Both are public claims, so the block between its markers
// must be exactly what the builder renders today, and each pick must link to a
// theme page that exists (the theme-page check further down keeps those pages
// true to the same files).
// ---------------------------------------------------------------------------
const { buildQuickPicks, QUICK_PICKS_START, QUICK_PICKS_END } = await import("./build-quick-picks.mjs");
const quickPicksStart = html.indexOf(QUICK_PICKS_START);
const quickPicksEnd = quickPicksStart === -1 ? -1 : html.indexOf(QUICK_PICKS_END, quickPicksStart + QUICK_PICKS_START.length);
if (quickPicksStart === -1 || quickPicksEnd === -1) {
  fail(
    `index.html has no quick-picks block (${QUICK_PICKS_START} … ${QUICK_PICKS_END}). ` +
      "Add both markers inside the collection section and run node scripts/build-quick-picks.mjs.",
  );
}
if (
  html.indexOf(QUICK_PICKS_START, quickPicksStart + 1) !== -1 ||
  html.indexOf(QUICK_PICKS_END, quickPicksEnd + 1) !== -1 ||
  (html.match(/class="quick-picks"/g) ?? []).length > 1
) {
  fail("index.html carries more than one quick-picks row or marker pair; the row appears once, between one pair of markers.");
}
const expectedQuickPicks = await buildQuickPicks(root);
if (html.slice(quickPicksStart, quickPicksEnd + QUICK_PICKS_END.length) !== expectedQuickPicks) {
  fail(
    "The quick picks in index.html are stale: they are not what scripts/build-quick-picks.mjs renders " +
      "from the theme files. Run it and commit the result.",
  );
}
for (const [, slug] of expectedQuickPicks.matchAll(/href="\/theme\/([a-z0-9-]+)\/"/g)) {
  const page = `theme/${slug}/index.html`;
  const exists = await stat(new URL(page, root)).then((entry) => entry.isFile(), () => false);
  if (!exists) fail(`A quick pick links /theme/${slug}/, but ${page} does not exist.`);
}

// ---------------------------------------------------------------------------
// The READMEs on GitHub link every theme by name to its page on the site
// (theme/<slug>/, rendered further down from the same theme files).
// scripts/build-readme-theme-links.mjs renders the lists: the fifty and the
// twelve in README.md, the Vol. 2 table in its plugin README. Each sits between
// two HTML comments and must be exactly what the builder renders today, so a
// README can never name a theme the pack no longer has, leave one out, or send
// a name to another theme's page. A block only counts where it renders: a start
// marker inside a code fence, a <pre>-style block or an open comment fails, as
// does one without a blank line on each side (an HTML block before it could
// run on into the list). Around the blocks the same rules hold for every
// theme-page address in these three files: written as
// [Name](https://gabs-utilities.com/theme/<slug>/) with the page's own name, or
// as the index, and nothing else; a theme name in brackets is that link and
// nothing else. The 50-theme plugin README has no list of its own and points
// at the index instead.
// ---------------------------------------------------------------------------
const readmeLinks = await import("./build-readme-theme-links.mjs");
const readmeTexts = new Map([["README.md", readme]]);
for (const path of readmeLinks.README_PATHS) {
  if (!readmeTexts.has(path)) readmeTexts.set(path, await readFile(new URL(path, root), "utf8"));
}
let readmeLinkBuild;
try {
  readmeLinkBuild = await readmeLinks.buildReadmeThemeLinks(root);
} catch (error) {
  fail(`The README theme lists cannot be rendered: ${error.message}`);
}
for (const [path, text] of readmeTexts) {
  // The markers and the generated blocks are compared line by line, so a carriage return would
  // read as text after each marker and the builder's LF lines would never match.
  if (text.includes("\r")) fail(`${path} has carriage returns (CR LF line endings); the READMEs use LF line endings only. Convert the file to LF.`);
  const [problem] = readmeLinks.themeLinkProblems(text, readmeLinkBuild.themes);
  if (problem) fail(`${path} ${problem}`);
  // A marker promises a generated list, so one that no block registers is a list nobody renders.
  for (const [marker, key] of text.matchAll(/<!-- theme-links:([^\s]*):(?:start|end) -->/g)) {
    if (!readmeLinkBuild.blocks.some((block) => block.path === path && block.key === key)) {
      fail(`${path} carries ${marker}, but no theme-links block with that key belongs in this file (see THEME_LINK_BLOCKS in scripts/build-readme-theme-links.mjs); remove it or register it.`);
    }
  }
}
for (const block of readmeLinkBuild.blocks) {
  const text = readmeTexts.get(block.path);
  const lines = text.split("\n");
  const { flow } = readmeLinks.markdownFlow(text);
  const where = `${block.path}, ${block.key} theme-links block`;
  for (const marker of [block.start, block.end]) {
    const count = text.split(marker).length - 1;
    if (count === 0) {
      fail(`${where}: no ${marker}. Write it on a line of its own with a blank line on each side and run node scripts/build-readme-theme-links.mjs.`);
    }
    if (count > 1) fail(`${where}: ${marker} appears ${count} times; it appears once.`);
    if (!lines.includes(marker)) fail(`${where}: ${marker} shares its line with other text; the marker is a line of its own.`);
  }
  const startLine = lines.indexOf(block.start);
  const endLine = lines.indexOf(block.end);
  if (endLine < startLine) fail(`${where}: ${block.end} comes before ${block.start}.`);
  const blank = (line) => /^[ \t]*$/.test(line);
  if ((startLine > 0 && !blank(lines[startLine - 1])) || (endLine < lines.length - 1 && !blank(lines[endLine + 1]))) {
    fail(`${where}: the block needs a blank line before ${block.start} and after ${block.end}, so the markers are blocks of their own.`);
  }
  if (!flow[startLine]) {
    fail(
      `${where}: ${block.start} on line ${startLine + 1} sits inside a code fence, a <pre>-style block or an HTML comment opened earlier, ` +
        "so the list would not render as links. Close it before the block.",
    );
  }
  const written = text.slice(text.indexOf(block.start), text.indexOf(block.end) + block.end.length);
  if (written !== block.rendered) {
    fail(`${where}: stale. It is not what scripts/build-readme-theme-links.mjs renders from the theme files. Run it and commit the result.`);
  }
}
{
  const path = "plugins/50-dark-themes/README.md";
  const text = readmeTexts.get(path);
  const { flow } = readmeLinks.markdownFlow(text);
  // A paragraph of its own: on a line of its own, in document flow, with a blank line (or the
  // file's edge) on each side. Anything else can swallow it without a trace — a link reference
  // definition whose label or title spans lines, a table, a lone tag the walk reads loosely.
  const lines = text.split("\n");
  const blank = (line) => /^[ \t]*$/.test(line);
  const indexLine = lines.findIndex(
    (line, index) =>
      line === readmeLinks.THEME_PAGE_URL && flow[index] && (index === 0 || blank(lines[index - 1])) && (index === lines.length - 1 || blank(lines[index + 1])),
  );
  if (indexLine === -1) {
    fail(`${path} must carry the theme page index ${readmeLinks.THEME_PAGE_URL} on a line of its own with a blank line before and after it, where it renders (the list of every page).`);
  }
}

// Each pack's free zip is a release asset that scripts/build-release-zip.sh names after the
// pack's manifest version, and release-zip.yml refuses any other tag. So the storefront and the
// README may only link the zip of the version they ship; a version bump that forgets the links
// stops here instead of pointing readers at an old pack or a release that does not exist.
// The 50-theme zip must be linked. The Vol. 2 zip is accepted at its current version and
// becomes required once its release exists (set `linked: true` in the same change that adds
// the link).
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const repositoryUrl = "https://github.com/notgabriels-sys/claude-code-50-dark-themes";
const releaseZips = [
  {
    label: "50 Dark Themes",
    version: pluginManifest.version,
    tag: `themes-plugin-v${pluginManifest.version}`,
    file: `claude-code-dark-themes-v${pluginManifest.version}.zip`,
    readmeLinkText: `v${pluginManifest.version} GitHub release →`,
    linked: true,
  },
  {
    label: "Vol. 2",
    version: vol2Manifest.version,
    tag: `dark-themes-vol-2-v${vol2Manifest.version}`,
    file: `claude-code-dark-themes-vol-2-v${vol2Manifest.version}.zip`,
    readmeLinkText: `Vol. 2 v${vol2Manifest.version} release →`,
    linked: false,
  },
];
const currentReleaseUrls = new Set();
for (const { label, version, tag, file, readmeLinkText, linked } of releaseZips) {
  const zipUrl = `${repositoryUrl}/releases/download/${tag}/${file}`;
  const releaseUrl = `${repositoryUrl}/releases/tag/${tag}`;
  currentReleaseUrls.add(zipUrl);
  currentReleaseUrls.add(releaseUrl);
  if (!linked) continue;
  // The version a reader sees beside the link must be the one the link resolves to.
  const storefrontLink = new RegExp(
    `href="${escapeRegExp(zipUrl)}">[^<]+</a> from the v${escapeRegExp(version)} release`,
  );
  if (!storefrontLink.test(html)) {
    fail(
      `The storefront must link the ${label} zip at ${zipUrl} and say "from the v${version} release" beside it.`,
    );
  }
  if (!readme.includes(`[${readmeLinkText}](${releaseUrl})`) || !readme.includes(`\`${file}\``)) {
    fail(`README must link the ${label} release as [${readmeLinkText}](${releaseUrl}) and name its zip ${file}.`);
  }
}
// Tags and asset names use letters, digits, dots and dashes; a trailing dot or comma is sentence
// punctuation, not part of the link, and is stripped before the lookup.
const releaseLinkPattern = /https:\/\/github\.com\/notgabriels-sys\/claude-code-50-dark-themes\/releases\/(?:tag|download)\/[\w.-]+(?:\/[\w.-]+)?/g;
const promotionQueueText = await readFile(new URL("PROMOTION_QUEUE.md", root), "utf8").catch(() => "");
const installGuide = await readFile(new URL("claude-code-theme-install-guide.html", root), "utf8");
for (const [source, text] of [
  ["The storefront", html],
  ["README", readme],
  ["PROMOTION_QUEUE.md", promotionQueueText],
  ["The install guide", installGuide],
]) {
  for (const [link] of text.matchAll(releaseLinkPattern)) {
    const url = link.replace(/[.,;:]+$/, "");
    if (!currentReleaseUrls.has(url)) {
      fail(`${source} links a release that no shipped pack version claims: ${url}.`);
    }
  }
}

// The install guide's FAQ schema answered "Do the 50 Claude Code themes cost anything?" with
// "The Gumroad ZIP can be downloaded for zero by choosing the free price" long after the free
// zip moved to the release asset above and the Gumroad archive was unlinked. Search engines
// quote that answer verbatim, so it must name the current zip, the page must not keep the old
// route anywhere, and the visible page must offer the same link, or the structured data
// describes a page that does not exist.
const fiftyThemePack = releaseZips.find((pack) => pack.label === "50 Dark Themes");
const fiftyThemeZipUrl = `${repositoryUrl}/releases/download/${fiftyThemePack.tag}/${fiftyThemePack.file}`;
const costQuestionName = "Do the 50 Claude Code themes cost anything?";
let installGuideFaq = null;
for (const [, json] of installGuide.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)) {
  let data;
  try {
    data = JSON.parse(json);
  } catch (error) {
    fail(`claude-code-theme-install-guide.html carries JSON-LD that does not parse: ${error.message}`);
  }
  if (data?.["@type"] === "FAQPage") installGuideFaq = data;
}
if (!installGuideFaq) {
  fail("claude-code-theme-install-guide.html carries no FAQPage JSON-LD block; the cost-question guard would be inert.");
}
// schema.org allows a single Question object where a list is expected.
const costQuestion = [].concat(installGuideFaq.mainEntity ?? []).find((entry) => entry?.name === costQuestionName);
if (!costQuestion) {
  fail(`The install guide's FAQ schema must keep the question "${costQuestionName}".`);
}
const costAnswer = typeof costQuestion.acceptedAnswer?.text === "string" ? costQuestion.acceptedAnswer.text : "";
if (/Gumroad ZIP|for zero by choosing the free price/i.test(installGuide)) {
  fail(
    "The install guide still sends readers to a Gumroad zip at the free price; the free pack is the GitHub release zip.",
  );
}
if (!costAnswer.includes(fiftyThemeZipUrl)) {
  fail(`The install guide's FAQ answer must name the free zip at ${fiftyThemeZipUrl}.`);
}
const installGuideZipLink = new RegExp(
  `href="${escapeRegExp(fiftyThemeZipUrl)}">[^<]+</a> from the v${escapeRegExp(fiftyThemePack.version)} release`,
);
if (!installGuideZipLink.test(installGuide)) {
  fail(
    `The install guide must link the ${fiftyThemePack.label} zip at ${fiftyThemeZipUrl} and say "from the v${fiftyThemePack.version} release" beside it, so the page shows what its FAQ schema promises.`,
  );
}

// ---------------------------------------------------------------------------
// Dated pages. The install guide and the semantic-colors article state when they were published
// and last modified in schema.org JSON-LD, one of the signals a search engine weighs for the date
// it may show beside the result, and in the byline a reader sees. The two must agree and be
// possible: one dated JSON-LD entity per page, calendar dates, published on or before modified,
// neither after the latest date in effect anywhere, the byline's dates as labelled <time>
// elements showing the same dates in words, an "updated" date shown exactly when the two differ,
// and no date anywhere else on the page. Where git history is in reach, dateModified is the day
// the page last changed in anything but its date stamp, a day apart at most for time zones, so
// the day a stamp was written never becomes the page's date. Every other HTML file carries no
// date marker at all, so a new dated page is held to the same rule from its first commit, or is
// added to the list on purpose. The rules and their messages live in scripts/page-dates.mjs.
// ---------------------------------------------------------------------------
const pageDates = await import("./page-dates.mjs");
const repositoryPath = (await import("node:url")).fileURLToPath(root);
for (const path of pageDates.DATED_PAGES) {
  const text = await readFile(new URL(path, root), "utf8");
  const [problem] = pageDates.pageDateProblems(text);
  if (problem) fail(`${path} ${problem}`);
  const { modified } = pageDates.statedDates(text);
  const change = pageDates.lastContentChange(path, { cwd: repositoryPath });
  if (change.date === null) {
    console.log(`${path}: dateModified ${modified} not held to git history (${change.reason}).`);
  } else if (Math.abs(Date.parse(modified) - Date.parse(change.date)) > 86400e3) {
    fail(`${path} JSON-LD dateModified is ${modified}, but the page last changed in anything other than its date stamp on ${change.date} (${change.sha.slice(0, 7)}); dateModified and the byline's update name the day of that change, a day apart at most for time zones. An edit to the dates or the byline alone is not a modification.`);
  }
}
const htmlFiles = (await readdir(root, { recursive: true }))
  .map((path) => path.replaceAll("\\", "/"))
  .filter((path) => path.endsWith(".html") && !path.split("/").some((segment) => [".git", ".worktrees", "node_modules"].includes(segment)))
  .sort();
for (const path of htmlFiles) {
  if (pageDates.DATED_PAGES.includes(path)) continue;
  const marker = pageDates.dateMarker(await readFile(new URL(path, root), "utf8"));
  if (marker) fail(`${path} carries ${marker} but is not one of the dated pages in scripts/page-dates.mjs; add it to DATED_PAGES so its dates are held to the same rule, or take the date out.`);
}

if (!readme.includes("mkdir -p ~/.claude/themes")) {
  fail("The manual install command must create ~/.claude/themes before copying files.");
}
if (!html.includes("claude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes")) {
  fail("The gallery must expose the native Claude Code marketplace install command.");
}
if (!html.includes("utm_campaign=50-dark-themes-launch")) {
  fail("The storefront must expose the tracked Product Hunt launch link.");
}

// Every script in scripts/ has its patterns checked before they are trusted.
//
// A payment slug or hosted id must be matched up to a DELIMITER — a negated
// class like [^"'\s<>)] — never up to a class of permitted characters like
// [a-z0-9-]. The permitted-character form silently truncates a lookalike to a
// known-good value: .../l/bqgfvX reads as the verified slug bqgfv, and
// .../ncp/payment/3SWZ64EXW9C8Wx reads as the verified id 3SWZ64EXW9C8W. Both
// then pass every downstream check while the page points somewhere else.
//
// That defect has now been introduced three separate times in this repository
// and fixed three separate times, most recently when a merge brought back
// /l/([a-z0-9-]+) in the developer-picks check. Fixing instances has not
// stopped it recurring, so the rule stops being prose and becomes a build
// failure: scan the source of every script in scripts/ and reject the
// permitted-character form in the one position where it truncates —
// immediately after /l/ or /ncp/payment/.
//
// Every script, not just this one. Scoping the scan to verify.mjs was this
// guard's own first version, and it would have missed the same pattern written
// into a sibling — a new checker, or this file split into modules. Only
// verify.mjs touches payment URLs today; the guard is scoped to the rule, not
// to today's layout.
//
// The scan deliberately looks only at that position. A host pattern such as
// ([a-z0-9.-]*gumroad\.com) is a permitted-character class too, but it is
// anchored by a literal suffix and cannot truncate to a shorter valid host, so
// flagging it would be noise. A guard that fires on everything proves nothing.
const scriptFiles = (await readdir(new URL("scripts/", root)))
  .filter((name) => name.endsWith(".mjs"))
  .sort();
// Comments are blanked rather than removed — the prose above and below has to
// be free to name the bad pattern without tripping the check, while line
// numbers in the failure message still point at the real line. Blanking also
// means the rule cannot be evaded by explaining it.
const blankComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (line) => " ".repeat(line.length));
// Built from pieces so this detector does not match its own source. Both the
// escaped form written inside a regex literal (\/l\/) and the plain form a
// new RegExp("…") string would use (/l/) are covered; catching only the
// escaped one would leave an obvious way around the rule.
const truncatingCapture = new RegExp(
  [
    "(?:",
    "\\\\?/l\\\\?/",
    "|",
    "ncp\\\\?/payment\\\\?/",
    ")",
    "\\(?",
    "\\[",
    "(?!\\^)",
  ].join(""),
  "g",
);
const truncatingSites = [];
for (const name of scriptFiles) {
  const code = blankComments(await readFile(fileUrl(`scripts/${name}`), "utf8"));
  for (const hit of code.matchAll(truncatingCapture)) {
    truncatingSites.push(`scripts/${name}:${code.slice(0, hit.index).split("\n").length}`);
  }
}
if (truncatingSites.length > 0) {
  fail(
    `A payment slug or hosted id is matched with a class of permitted ` +
      `characters at ${truncatingSites.join(", ")}. Capture to a ` +
      `delimiter instead — ([^"'\\s<>)]+) — and split on ?/# afterwards. A ` +
      `permitted-character class truncates a lookalike to a verified value ` +
      `and passes it. See CLAUDE.md.`,
  );
}

// Shared by every Gumroad check below. Both are deliberate: capture to a
// delimiter (quote, whitespace, bracket) rather than to a class of permitted
// characters, then strip a real query or fragment. Narrowing the pattern back
// to a character class reopens the lookalike-slug bypass — see CLAUDE.md.
const gumroadSlugOf = (raw) => raw.split(/[?#]/, 1)[0];
const gumroadLinkPattern = /https:\/\/notgabriel\.gumroad\.com\/l\/([^"'\s<>)]+)/g;

const featuredProducts = [...html.matchAll(/<article class="featured-product">([\s\S]*?)<\/article>/g)];
if (featuredProducts.length !== 3) {
  fail(`Expected 3 curated developer picks; found ${featuredProducts.length}.`);
}

const expectedFeaturedSlugs = new Set(["cfcvmy", "ckthsb", "dark-app-screens"]);
const actualFeaturedSlugs = new Set();
for (const [, productHtml] of featuredProducts) {
  const image = productHtml.match(/<img\s+[^>]*src="([^"]+)"[^>]*alt="([^"]+)"[^>]*>/);
  if (!image) {
    fail("Every curated developer pick must include a local cover image with non-empty alt text.");
  }
  const [, imagePath, imageAlt] = image;
  if (!imagePath.startsWith("assets/products/") || !imageAlt.trim()) {
    fail("Curated developer pick covers must use local product assets and meaningful alt text.");
  }
  await verifyPng(imagePath, {
    label: "Curated developer pick cover",
    width: 1280,
    height: 720,
  });

  // Capture to a delimiter, never to a permitted-character class: `([a-z0-9-]+)`
  // truncates `.../l/bqgfvX` to the known slug `bqgfv`, so a lookalike product
  // link passes as a verified one. That bypass has already been paid for once
  // here — see CLAUDE.md. Split on ?/# afterwards, because the developer-picks
  // row legitimately carries `?utm_source=…` and `?` genuinely ends the path.
  const gumroadLink = productHtml.match(/https:\/\/notgabriel\.gumroad\.com\/l\/([^"'\s<>)]+)/);
  if (!gumroadLink) {
    fail("Every curated developer pick must link to its verified Gumroad product page.");
  }
  const slug = gumroadSlugOf(gumroadLink[1]);
  const trackedCheckout = productHtml.match(
    /href="(https:\/\/notgabriel\.gumroad\.com\/l\/[^"'\s<>)]+\?[^\"]+)"/,
  );
  if (!trackedCheckout) {
    fail(`Curated developer pick ${slug} must include campaign tracking.`);
  }
  const trackedUrl = new URL(trackedCheckout[1].replaceAll("&amp;", "&"));
  const expectedTracking = {
    utm_source: "gabs-utilities.com",
    utm_medium: "storefront",
    utm_campaign: "developer-picks",
    utm_content: slug,
  };
  for (const [key, value] of Object.entries(expectedTracking)) {
    if (trackedUrl.searchParams.get(key) !== value) {
      fail(`Curated developer pick ${slug} has incorrect ${key} tracking.`);
    }
  }
  actualFeaturedSlugs.add(slug);
}
if ([...expectedFeaturedSlugs].some((slug) => !actualFeaturedSlugs.has(slug))) {
  fail("The curated developer picks must feature the UI kit, HTML templates, and app screens.");
}
const uiKitPreview = html.match(/<section[^>]*id="ui-kit-preview"[^>]*>[\s\S]*?<\/section>/);
if (!uiKitPreview) {
  fail("The storefront must expose the UI kit preview section.");
}
if (!html.includes('href="#ui-kit-preview"')) {
  fail("The Dark UI Kit card must link to its first-party preview section.");
}
if (/<(?:a|link)\b[^>]*\bhref=["'][^"']*dark-ui\.css(?:[?#][^"']*)?["'][^>]*>/i.test(html)) {
  fail("The storefront must not publish the paid Dark UI Kit stylesheet.");
}
const expectedUiKitPreviewImages = [
  "assets/products/dark-ui-kit-components.png",
  "assets/products/dark-ui-kit-cards.png",
  "assets/products/dark-ui-kit-light-mode.png",
];
for (const imagePath of expectedUiKitPreviewImages) {
  if (!uiKitPreview[0].includes(`src="${imagePath}"`)) {
    fail(`The UI kit preview must include ${imagePath}.`);
  }
  await verifyPng(imagePath, {
    label: "UI kit preview image",
    width: 1265,
    height: 712,
  });
}

if (html.includes("api.producthunt.com/widgets/embed-image")) {
  fail("Do not restore the remote Product Hunt badge; it sets a third-party cookie.");
}
if (html.includes("notgabriel.gumroad.com/l/wmlrk")) {
  fail("Do not restore the résumé checkout until its download is verified.");
}
if (/stripe/i.test(html)) {
  fail("No Stripe link is verified for this site.");
}
// Every Gumroad link on every public page and in the README must point at a
// product someone has actually loaded.
//
// Capture to a DELIMITER ([^"'\s<>]+), then strip the query string. `?` and `#`
// genuinely end a URL path -- the developer-picks row legitimately carries
// `?utm_source=...` -- but a permitted-character class such as ([a-z0-9-]+)
// stops at the first character it does not permit, so `bqgfvX` would read as
// the verified slug `bqgfv` and a lookalike link would sail through. That is
// the same defect that let a EUR1,200 PayPal lookalike pass this file's own
// guard. Do not narrow this back to a character class.
for (const file of publicHtmlFiles) {
  const source = await readFile(fileUrl(file), "utf8");
  if (!source.includes('rel="icon" type="image/svg+xml" href="favicon.svg"')) {
    fail(`${file} must expose the first-party SVG favicon.`);
  }
  for (const match of source.matchAll(gumroadLinkPattern)) {
    const slug = gumroadSlugOf(match[1]);
    if (!verifiedGumroadSlugs.has(slug)) {
      fail(`${file} contains an unverified or unavailable Gumroad product link: ${slug}.`);
    }
  }
}
for (const match of readme.matchAll(gumroadLinkPattern)) {
  const slug = gumroadSlugOf(match[1]);
  if (!verifiedGumroadSlugs.has(slug)) {
    fail(`README.md contains an unverified or unavailable Gumroad product link: ${slug}.`);
  }
}

// README prices, which nothing read until now.
//
// The slug allowlist above has always covered README.md, but the numbers beside
// those slugs were unguarded: changing "€12" to "€99" on the product table, or
// the bundle's "$39" to "$399", left CI green. Both were reproduced before this
// was written. The README is the most-read surface in the repository, so a
// stale price there is a wrong price shown to more readers than index.html has.
//
// Checked per line, because the README legitimately aggregates in a way the
// storefront does not: one row links two products and prices them "€7 each",
// another links two and says "from €6", and a name-your-price row may say "$0
// is fine". Demanding one exact price per line would fail on honest copy. So every
// currency amount on a line must equal the recorded price of ONE of the
// products that line links — which still rejects a number belonging to no
// linked product, while leaving "each" and "from" phrasing free.
//
// Like recordedGumroadPrices itself, this is drift detection, not verification:
// it asserts the README agrees with what index.html says, and index.html has
// never been checked against Gumroad. See that table's comment.
for (const [index, line] of readme.split("\n").entries()) {
  const slugs = [...line.matchAll(gumroadLinkPattern)].map((m) => gumroadSlugOf(m[1]));
  if (slugs.length === 0) continue;

  const allowed = new Set();
  let allowsFree = false;
  for (const slug of slugs) {
    const price = recordedGumroadPriceBySlug.get(slug);
    if (price === null) allowsFree = true;
    else if (price !== undefined) allowed.add(price);
  }
  if (allowsFree) {
    // A name-your-price product may state $0 or nothing at all.
    allowed.add("$0");
    allowed.add("€0");
  }

  for (const stated of statedAmounts(line)) {
    if (!allowed.has(stated)) {
      fail(
        `README.md line ${index + 1} states ${stated} beside ${slugs.join(", ")}, ` +
          `but recordedGumroadPrices has ${[...allowed].join(", ") || "no price"} ` +
          `for those products. If the change is deliberate, read the real product ` +
          `back from gumroad.com first, then update the table and the page.`,
      );
    }
  }
}

for (const { id, price } of verifiedPayPalLinks) {
  const href = `https://www.paypal.com/ncp/payment/${id}`;
  // Quote-exact: a bare substring check would also be satisfied by a longer
  // lookalike such as .../<id>x, which is a different payment link.
  if (!html.includes(`href="${href}"`)) {
    fail(`Verified PayPal link ${id} is missing.`);
  }
}

// The checks above prove the three verified links are present and correctly
// priced. This one proves nothing else got added: a fourth NCP link is an
// unverified charge on a public shop, which is the exact failure this repo
// already paid for once.
//
// It runs over EVERY public page and README.md, not just index.html. Scanning
// only index.html was this check's own first version, and it was a live hole:
// an unverified NCP link placed on impressum.html shipped with CI green, while
// the identical link on index.html failed the build. Both were reproduced
// against the real pages before this was widened. The Gumroad half of the shop
// had already been widened this way, and leaving the PayPal half narrow is the
// same defect class left standing on the other side — see CLAUDE.md.
//
// Capture to a DELIMITER ([^"'\s<>]+), never to a permitted character class.
// An earlier version used ([A-Z0-9]+); .../3SWZ64EXW9C8Wx then truncated to the
// known id 3SWZ64EXW9C8W and a EUR1,200 lookalike link passed CI. The Gumroad
// slug pattern had the same defect with a dot suffix. Both were reproduced,
// then fixed. Do not narrow these back to a character class.
const payPalLinkPattern = /paypal\.com\/ncp\/payment\/([^"'\s<>]+)/g;
const payPalSources = [
  ...(await Promise.all(
    publicHtmlFiles.map(async (file) => ({
      label: file,
      source: await readFile(fileUrl(file), "utf8"),
    })),
  )),
  { label: "README.md", source: readme },
];
for (const { label, source } of payPalSources) {
  for (const id of new Set([...source.matchAll(payPalLinkPattern)].map((m) => m[1]))) {
    if (!verifiedPayPalIds.includes(id)) {
      fail(
        `Unverified PayPal link ${id} is on ${label}. Read it back from ` +
          `paypal.com/ncp/links/${id} and add it to verifiedPayPalLinks first.`,
      );
    }
  }
}
// After the id check above, so an unverified id is reported by the check
// written for it. Every card for every verified id, on every public page,
// states that id's price -- not only the first card on index.html, which is all
// this read until 2026-10-18: a second "Mastering EUR45" card linking the EUR190 id, or the
// same card on impressum.html, was never price-checked. Every currency amount
// inside a card must be the verified one, rather than one exact price element:
// main restyled these cards to "View checkout · EUR45" on 2026-08-24, and a
// check pinned to `<i>EUR45</i>` would have passed a card that showed a second,
// wrong number elsewhere in the same anchor. And every NCP URL on a page must be
// the href of a card read here, or a link written another way (single quotes,
// no quotes, outside an anchor) would never be priced -- the same count the
// Gumroad cards already have.
for (const { label, source } of payPalSources.filter(({ label }) => label.endsWith(".html"))) {
  let cardsRead = 0;
  for (const { id, price } of verifiedPayPalLinks) {
    const href = escapeRegExp(`https://www.paypal.com/ncp/payment/${id}`);
    for (const card of source.matchAll(new RegExp(`<a[^>]*href="${href}"[^>]*>([\\s\\S]*?)</a>`, "g"))) {
      cardsRead += 1;
      const stated = statedAmounts(card[1]);
      if (stated.length === 0) {
        fail(`PayPal link ${id} on ${label} must charge ${price}; its card states no price at all.`);
      }
      for (const amount of stated) {
        if (amount !== price) {
          fail(
            `PayPal link ${id} must charge ${price} per the verified rate card; ` +
              `its card on ${label} states ${amount}.`,
          );
        }
      }
    }
  }
  const urlsWritten = [...source.matchAll(payPalLinkPattern)].length;
  if (urlsWritten !== cardsRead) {
    fail(
      `${label} has ${urlsWritten} PayPal NCP URL(s) but only ${cardsRead} of them are the href="..." ` +
        `of an <a> the price check reads.`,
    );
  }
}

// Same shape for the Gumroad half of the shop. Any Gumroad link on a host other
// than the canonical one is a typo at best and a lookalike at worst.
const gumroadHosts = [
  ...html.matchAll(/https:\/\/([a-z0-9.-]*gumroad\.com)/g),
].map((match) => match[1]);
for (const host of new Set(gumroadHosts)) {
  if (host !== GUMROAD_HOST) {
    fail(`Gumroad link points at ${host}, not ${GUMROAD_HOST}.`);
  }
}

// Every Gumroad anchor on the shop page, with the slug it points at and the
// text it wraps. Slugs go through gumroadSlugOf, so the developer-picks row's
// `?utm_source=...` resolves to the product it names while `bqgfvX` stays
// `bqgfvX` and fails the allowlist.
// Cards are collected from EVERY public page, not just index.html.
//
// Scoping the price checks to index.html was their own first version, and it
// left a reachable gap: the slug allowlist runs over every page, so an
// unverified slug elsewhere fails, but a slug that IS verified could be printed
// on another page at any price at all and nothing looked. Reproduced before
// widening — a card linking the verified slug `bqgfv` (recorded €8) and stating
// €99 shipped green from impressum.html, and a bare Gumroad URL outside an
// anchor escaped there too.
//
// Only index.html carries Gumroad links today, so this changes no current
// result. That is the point: the check is scoped to the rule, not to where the
// links happen to live this week. It is the same widening already applied to
// the Gumroad slug allowlist and to the PayPal unverified-link allowlist; the
// price half was the one still standing narrow.
const gumroadCardPattern =
  /<a\b([^>]*)href="https:\/\/notgabriel\.gumroad\.com\/l\/([^"'\s<>]+)"([^>]*)>([\s\S]*?)<\/a>/g;
const gumroadCardsByFile = new Map();
for (const file of publicHtmlFiles) {
  const source = file === "index.html" ? html : await readFile(fileUrl(file), "utf8");
  const cards = [...source.matchAll(gumroadCardPattern)].map((match) => ({
    slug: gumroadSlugOf(match[2]),
    attrs: `${match[1]} ${match[3]}`,
    inner: match[4],
  }));
  gumroadCardsByFile.set(file, cards);

  // A Gumroad URL printed outside an anchor would escape every price check
  // below without this. The two counts must agree, on every page.
  const rawLinks = [...source.matchAll(gumroadLinkPattern)];
  if (rawLinks.length !== cards.length) {
    fail(
      `${file} has ${rawLinks.length} Gumroad URLs but only ` +
        `${cards.length} of them are inside an <a> the price guard can read.`,
    );
  }
}
const gumroadCards = gumroadCardsByFile.get("index.html") ?? [];

const presentGumroadSlugs = new Set(gumroadCards.map((card) => card.slug));
for (const slug of presentGumroadSlugs) {
  if (!recordedGumroadPriceBySlug.has(slug)) {
    fail(
      `Unknown Gumroad slug "${slug}" is on the page. Confirm it is the product ` +
        `you mean at gumroad.com, then add it to verifiedGumroadSlugs and ` +
        `recordedGumroadPrices.`,
    );
  }
}
for (const { slug } of recordedGumroadPrices) {
  if (!presentGumroadSlugs.has(slug)) {
    fail(
      `Gumroad slug "${slug}" has disappeared from the page. Remove it from ` +
        `recordedGumroadPrices and verifiedGumroadSlugs if that was deliberate.`,
    );
  }
}

// Page-price drift. This checks index.html against recordedGumroadPrices and
// NOTHING ELSE -- read that table's comment before trusting a green build here.
// It catches an unintended edit; it cannot catch a price that was already wrong
// on the day it was recorded.
//
// The page now states a price in three ways: an <i> on the grid cards, a <span>
// on the developer-picks cards, and words in those cards' aria-label. Rather
// than pin the markup, every currency amount inside the anchor must equal the
// recorded one -- so a restyle is free but a changed number is not, and a
// screen-reader label cannot quietly disagree with what sighted buyers see.
for (const [file, cards] of gumroadCardsByFile) {
 for (const { slug, attrs, inner } of cards) {
  const where = `${slug} on ${file}`;
  const price = recordedGumroadPriceBySlug.get(slug);
  const shown = statedAmounts(inner);

  if (price === null) {
    if (shown.length > 0) {
      fail(
        `Gumroad card ${where} now states ${shown.join(", ")} and recordedGumroadPrices ` +
          `says it states no price. Read the real product at gumroad.com, then record it.`,
      );
    }
  } else if (shown.length === 0) {
    fail(`Gumroad card ${where} no longer states its ${price} price.`);
  } else {
    for (const amount of shown) {
      if (amount !== price) {
        fail(
          `Gumroad card ${where} states ${amount}; recordedGumroadPrices says ${price}. ` +
            `If the change is deliberate, read the real product back from gumroad.com ` +
            `first, then update the table.`,
        );
      }
    }
  }

  // The aria-label carries the price too, and it has already been written two
  // ways: "for 12 euros" (words) and "View product €12 — ..." (symbol). Check
  // both forms rather than pinning either, so a rewording cannot silently drop
  // the check and leave a screen reader quoting a stale number.
  const label = (attrs.match(/aria-label="([^"]*)"/) ?? [])[1] ?? "";
  const spokenAmounts = statedAmounts(label);
  const spokenWords = label.match(/for (\d[\d.,]*) (euros|dollars)/);
  if (spokenWords) {
    spokenAmounts.push(`${spokenWords[2] === "euros" ? "€" : "$"}${spokenWords[1]}`);
  }
  for (const amount of spokenAmounts) {
    if (!price) {
      fail(`Gumroad card ${where} speaks ${amount} to screen readers but records no price.`);
    } else if (amount !== price) {
      fail(
        `Gumroad card ${where} reads out ${amount} to screen readers but is priced ` +
          `${price}. A label that disagrees with the visible price is a wrong price ` +
          `for the buyer who cannot see it.`,
      );
    }
  }
 }
}

const { roleAwareComparisonCount } = await import("./verify-contrast.mjs");

// ---------------------------------------------------------------------------
// Stated numbers are public claims. The share card shipped "726 role-aware
// checks" for days after the real figure became 894, because nothing tied the
// printed number to the computed one. Every surface that states a count is now
// checked against what the verifier actually ran.
// ---------------------------------------------------------------------------
const socialCard = await readFile(new URL("assets/social-preview.html", root), "utf8");
const claimSurfaces = [
  ["index.html", html],
  ["assets/social-preview.html", socialCard],
];

for (const [page, source] of claimSurfaces) {
  // Any "<n> role-aware ..." claim must be the real comparison total. The
  // number and the phrase are often split by markup — the proofline reads
  // `<dt>894</dt><dd>role-aware checks</dd>` — so allow a run of tags between
  // them, but no intervening text. A "+" after the number is part of it.
  const claims = [...source.matchAll(/(?<![\w.,:\/-])(\d[\d,]*)\+?\s*(?:<\/?[a-z][^>]*>\s*)*role-aware/gi)];
  if (!claims.length) {
    fail(`${page} states no role-aware check count; the claim guard would be inert.`);
  }
  for (const claim of claims) {
    const value = Number.parseInt(claim[1].replace(/,/g, ""), 10);
    if (value !== roleAwareComparisonCount) {
      fail(
        `${page}:${lineAt(source, claim.index)} claims ${value} role-aware checks; the verifier runs ` +
          `${roleAwareComparisonCount}.`,
      );
    }
  }
}

// The share card names both pack sizes: "<50> + <12> themes".
const cardThemeCounts = socialCard.match(/<b>(\d+)\s*\+\s*(\d+)<\/b>\s*themes/);
if (!cardThemeCounts) {
  fail("The social card must state the theme counts as \"<n> + <n> themes\".");
}
if (Number(cardThemeCounts[1]) !== files.length || Number(cardThemeCounts[2]) !== vol2Files.length) {
  fail(
    `The social card claims ${cardThemeCounts[1]} + ${cardThemeCounts[2]} themes; ` +
      `the repository ships ${files.length} + ${vol2Files.length}.`,
  );
}

// The finder hides non-matching cards by setting the `hidden` property. That
// only works while no author rule outranks the UA sheet's [hidden]{display:none}
// — and .card is display:flex, so it does. Without an explicit override the
// search box and the family filters set the attribute and update the "N themes"
// counter while every card stays on screen; searching for nothing at all showed
// the empty-state message above all fifty cards. Assert the override is present
// on any page whose script toggles the property.
for (const file of publicHtmlFiles) {
  const source = await readFile(fileUrl(file), "utf8");
  if (!/\.hidden\s*=/.test(source)) continue;
  if (!/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(source)) {
    fail(
      `${file} toggles the hidden property but never overrides it in CSS; ` +
        "an author display rule would leave hidden elements on screen. " +
        "Add [hidden]{display:none!important}.",
    );
  }
}

// The finder must reach every theme the page renders, not just the archive's.
// It used to select `grid.querySelectorAll(".card")`, so once Vol. 2 shipped,
// searching "afterglow" printed "No themes match that search" while Afterglow
// was on screen twelve cards below. Selecting document-wide on the attribute
// the renderer writes keeps a future pack in the finder without a code change,
// so require that shape rather than a hand-listed set of grids.
if (/\bgrid\.querySelectorAll\(\s*["']\.card["']\s*\)/.test(html)) {
  fail(
    "index.html scopes the finder to one grid; themes in any other grid would " +
      "be unreachable by search while the page claims none match. Select " +
      '`.card[data-search]` across the document instead.',
  );
}
if (!/document\.querySelectorAll\(\s*["']\.card\[data-search\]["']\s*\)/.test(html)) {
  fail("index.html no longer selects finder cards document-wide; the finder guard would be inert.");
}

// The README tells people to clone and run `./install.sh`. That only works if
// the file carries the executable bit in git — it shipped as mode 100644, so
// the documented command failed with "Permission denied" on every fresh clone.
// A mode is invisible in a diff, so assert it.
const installerStat = await stat(new URL("install.sh", root));
if (!(installerStat.mode & 0o111)) {
  fail("install.sh is not executable; the README's `./install.sh` fails on a fresh clone. Run git update-index --chmod=+x install.sh.");
}

// Its --help prints the header comment block. A hardcoded line range drifts as
// the header grows: `sed -n '2,12p'` had already slipped past the block and
// printed `set -euo pipefail` to the user. Require the block be delimited by
// the comments themselves.
const installer = await readFile(new URL("install.sh", root), "utf8");
if (/-h\|--help\)[^\n]*sed -n ['"]\d+,\d+p/.test(installer)) {
  fail("install.sh builds --help from a fixed line range; it drifts as the header changes. Delimit the block by the comment run instead.");
}

// That same header is the only thing a user reads before running --uninstall,
// and the uninstall branch matches by filename and rm -f's whatever it finds.
// It has no idea what it installed, so it must not claim it does: the header
// said "remove the ones this script installed" while deleting a hand-written
// acid.json it never wrote, with none of the backup care the install path takes.
const installerHeader = installer.split(/^set -euo pipefail$/m)[0];
if (/the ones this script installed/i.test(installerHeader)) {
  fail("install.sh --help claims --uninstall removes only what the script installed. It matches by filename and deletes a same-named file it never wrote. Say what it really does, or make the removal content-aware.");
}
if (!/matches by filename, not contents/i.test(installerHeader)) {
  fail("install.sh --help must say --uninstall matches by filename, not contents; without it the destructive path reads safer than it is.");
}

// The install guide's manual fallback is a procedure people follow verbatim on
// a page that search can land them on directly. It used to open with
// `cp *.json ~/.claude/themes/` and never say where the files come from — the
// page contained no clone, download, archive or curl step at all — so the copy
// silently depended on the reader already standing in a clone. It also copied
// only the root fifty, immediately after introducing Vol. 2 by name, leaving
// anyone without the plugin flow no manual route to the twelve.
const manualSection = installGuide.match(/<section[^>]*id="manual"[\s\S]*?<\/section>/);
// A manual install copies theme files out of a clone, and the clone's root
// also holds themes.json, the published index, which is not a theme: copied
// into a themes folder it shows up in /theme as a 51st "theme" named after the
// pack. So every documented copy into a themes folder reads a pack's own
// themes/ directory, as install.sh does.
for (const [file, text] of [["README.md", readme], ["claude-code-theme-install-guide.html", normalizeHtmlText(installGuide)]]) {
  for (const match of text.matchAll(/\bcp\s+(\S*\*\.json)\s+\S*\.claude\/themes/g)) {
    if (!/(?:^|\/)plugins\/[^/\s]+\/themes\/\*\.json$/.test(match[1])) {
      fail(
        `${file} copies ${match[1]} into a themes folder. That glob reaches the repository root, where ` +
          "themes.json would install as a theme; copy from plugins/<pack>/themes/ instead.",
      );
    }
  }
}
if (!manualSection) {
  fail("claude-code-theme-install-guide.html has no #manual section; the manual-route guard would be inert.");
}
if (!/git<\/span>\s*<span[^>]*>clone |git clone /.test(manualSection[0])) {
  fail(
    "The install guide's manual route never says how to obtain the theme files. " +
      "Its copy commands assume a clone; state the clone step.",
  );
}
if (!manualSection[0].includes("plugins/dark-themes-vol-2/themes/")) {
  fail(
    "The install guide's manual route copies only the root themes, so it silently " +
      "skips Vol. 2. Copy plugins/dark-themes-vol-2/themes/*.json too.",
  );
}

// Copy that advertises a product nobody can buy. The Claude Code Workflow Kit
// (slug zvbti) is built but unpublished — its own PUBLISHING.md records
// is_published: false — so it is deliberately absent from verifiedGumroadSlugs
// above. PROMOTION_QUEUE.md scrubbed its own paste-ready copy of "workflow kits"
// for that reason, but the DEV Community draft still listed "workflow packs" in
// the catalog. Until the slug is verified and added to the set, no paste-ready
// copy may mention it: the DEV draft as a whole, and PROMOTION_QUEUE.md's fenced
// blocks (its prose legitimately explains why the kit is held back).
if (!verifiedGumroadSlugs.has("zvbti")) {
  const unpublishedProduct = /workflow[ -]?(kit|pack)s?/i;
  const devDraft = await readFile(new URL("DEV_COMMUNITY_ARTICLE_DRAFT.md", root), "utf8");
  if (unpublishedProduct.test(devDraft)) {
    fail("DEV_COMMUNITY_ARTICLE_DRAFT.md advertises the Workflow Kit, which is unpublished (zvbti is not in verifiedGumroadSlugs). Remove it from the copy, or publish and verify the product first.");
  }
  const promoQueue = await readFile(new URL("PROMOTION_QUEUE.md", root), "utf8");
  const fenced = promoQueue.match(/```[\s\S]*?```/g) ?? [];
  if (fenced.some((block) => unpublishedProduct.test(block))) {
    fail("PROMOTION_QUEUE.md paste-ready copy advertises the Workflow Kit, which is unpublished (zvbti is not in verifiedGumroadSlugs).");
  }
}

// One image, one description. preview.png is shared by every public page; it
// was described three different ways, two of them as "a gallery preview" of a
// card that has never been a gallery. Alt text drifts silently because nobody
// sees it — so pages that share an image must state the same alt, and a page
// that ships an og:image without alt text fails.
const sharedImageAlts = new Map();
for (const file of publicHtmlFiles) {
  const source = await readFile(fileUrl(file), "utf8");
  const image = source.match(/<meta property="og:image" content="([^"]+)">/);
  if (!image) continue;
  const ogAlt = source.match(/<meta property="og:image:alt" content="([^"]+)">/);
  if (!ogAlt) fail(`${file} ships an og:image with no og:image:alt.`);
  if (/<meta name="twitter:image" content=/.test(source)) {
    const twitterAlt = source.match(/<meta name="twitter:image:alt" content="([^"]+)">/);
    if (!twitterAlt) fail(`${file} ships a twitter:image with no twitter:image:alt.`);
    if (twitterAlt[1] !== ogAlt[1]) {
      fail(`${file} describes the same share image differently to Open Graph and X.`);
    }
  }
  const seen = sharedImageAlts.get(image[1]);
  if (seen && seen.alt !== ogAlt[1]) {
    fail(
      `${file} and ${seen.file} share ${image[1]} but describe it differently. ` +
        "One image gets one description.",
    );
  }
  if (!seen) sharedImageAlts.set(image[1], { file, alt: ogAlt[1] });
}

// themes.json — the machine-readable theme index published at
// gabs-utilities.com/themes.json. It is generated from the theme files, so the
// only way it can be wrong is if someone edits it by hand or forgets to
// regenerate after changing a theme. Rebuild it here and compare byte for byte;
// a consumer reading a stale index gets a palette that is not what ships.
const expectedThemeIndex = serializeThemeIndex(await buildThemeIndex());
let publishedThemeIndex;
try {
  publishedThemeIndex = await readFile(new URL("themes.json", root), "utf8");
} catch {
  fail("themes.json is missing. Run `node scripts/build-theme-index.mjs`.");
}
if (publishedThemeIndex !== expectedThemeIndex) {
  fail(
    "themes.json is out of date or was hand-edited. Regenerate it with " +
      "`node scripts/build-theme-index.mjs` — do not edit it directly.",
  );
}

// The byte comparison above proves themes.json matches what the generator
// CURRENTLY emits. It cannot prove the generator is right, and the documented
// workflow hides that: `build-theme-index && verify` regenerates the file from
// the same code the check rebuilds from, so the two agree no matter what the
// generator does. Reproduced before writing this — collapsing SUMMARY_ROLES so
// each theme published a one-key palette instead of four left themes.json
// gutted and build, verify and verify-contrast all exiting 0.
//
// So check the index against the THEME FILES, which the generator does not get
// to define. Every entry must name its four palette roles and every value must
// equal that role in the theme's own source. A consumer reading this index gets
// what installs, or the build goes red.
const indexRoles = ["claude", "claudeShimmer", "text", "inactive"];
const parsedThemeIndex = JSON.parse(expectedThemeIndex);
if (parsedThemeIndex.themes.length !== files.length) {
  fail(
    `themes.json describes ${parsedThemeIndex.themes.length} themes but ` +
      `${files.length} theme files ship.`,
  );
}
for (const entry of parsedThemeIndex.themes) {
  const source = JSON.parse(await readFile(fileUrl(`${entry.id}.json`), "utf8"));
  if (entry.name !== source.name) {
    fail(`themes.json calls ${entry.id} "${entry.name}"; the theme file says "${source.name}".`);
  }
  if (entry.base !== source.base) {
    fail(`themes.json gives ${entry.id} base "${entry.base}"; the theme file says "${source.base}".`);
  }
  const published = Object.keys(entry.palette ?? {}).sort();
  if (published.join(",") !== [...indexRoles].sort().join(",")) {
    fail(
      `themes.json publishes palette roles [${published.join(", ")}] for ` +
        `${entry.id}; it must publish exactly [${indexRoles.join(", ")}]. A ` +
        `consumer reading a partial palette renders something that does not ship.`,
    );
  }
  for (const role of indexRoles) {
    if (entry.palette[role] !== source.overrides[role]) {
      fail(
        `themes.json gives ${entry.id}.${role} as ${entry.palette[role]} but ` +
          `${entry.id}.json says ${source.overrides[role]}.`,
      );
    }
  }
}

// The index sits at the repo root among the 50 theme files, so it is the one
// root .json that is not a theme. Assert that exclusion instead of trusting it:
// if it ever leaked into the plugin it would install as a 51st "theme" with no
// name or base, and the theme-count check above would already have gone red.
if (pluginFiles.includes("themes.json")) {
  fail("themes.json was copied into the plugin; it is an index, not a theme.");
}

// Deep links. themes.json promises https://gabs-utilities.com/#theme-<id> for
// every theme; a promised URL that resolves to nothing silently lands the
// visitor at the top of the page. Two facts make each URL real, so assert
// both. First, the card template must actually emit the anchor. Second, the
// gallery derives its slug from the DISPLAY NAME (lowercased, spaces to
// dashes) while the index id comes from the FILENAME — for all 50 they agree
// today, but that agreement is a coincidence of naming, not a rule anything
// else enforces, so a theme named out of step with its file would ship a dead
// link without this check.
if (!html.includes('id="theme-${themeSlug}"')) {
  fail("The gallery card template no longer emits id=\"theme-<slug>\" anchors.");
}
const gallerySlugs = new Set(
  galleryThemes.map(([name]) => name.toLowerCase().replace(/ /g, "-")),
);
const themeIndex = JSON.parse(publishedThemeIndex);
for (const theme of themeIndex.themes) {
  const promised = theme.url.match(/#theme-([a-z0-9-]+)$/)?.[1];
  if (!promised || !gallerySlugs.has(promised)) {
    fail(
      `themes.json promises ${theme.url} but the gallery renders no card with ` +
        `that anchor. Rename the theme or the file so display-name slug and ` +
        `filename agree.`,
    );
  }
}

// The crawlable ItemList block in index.html is generated from the same source
// as themes.json and held to the same standard: rebuild and compare byte for
// byte. A stale or hand-edited block would hand crawlers theme names or deep
// links that disagree with what actually ships.
const expectedItemList = serializeThemeItemList(await buildThemeIndex());
if (!html.includes(expectedItemList)) {
  fail(
    "The theme ItemList block in index.html is missing, stale, or was " +
      "hand-edited. Regenerate it with `node scripts/build-theme-index.mjs` " +
      "— do not edit it directly.",
  );
}

// The byte comparison above proves the block matches what the generator
// produces now — not that the generator is right. Its expected value comes from
// serializeThemeItemList, the function that wrote the block, so a generator bug
// regenerates into a block that agrees with itself. Reproduced 2026-10-18 by
// mutating the generator and regenerating, each with verify green: a dropped
// theme, positions from 0, a numberOfItems disagreeing with the list, names and
// urls swapped, dead anchors, slugs as names, a duplicated theme, "@type":
// "List". So did a stale second ItemList block after the real one (the
// generator rewrites only the first marker pair, so it survives regeneration)
// and an unmarked extra ItemList. The same self-agreement let a partial
// palette into themes.json until its content was checked against the theme
// files; this holds the crawlable list to the same standard.
//
// Every expected value below comes from somewhere other than the generator:
// the root theme files (names and ids, in file order), CNAME (the domain the
// site is served from) and the plugin manifest (the list's name). Each url is
// pinned to #theme-<file id>, and the deep-link check above already requires
// every file id's anchor to exist in the gallery, so a pinned url cannot land
// on a card that is not there.
//
// The first version of this check was reviewed adversarially the day it
// landed and leaked in seven ways, each reproduced with a crawler's view of
// the page (Chromium's DOM) showing a wrong list while verify stayed green: a
// second ItemList whose script tag was spelled any other way (quotes, an id,
// case, a newline, an entity); an ItemList nested under hasPart or mainEntity,
// or typed as an IRI or CURIE; generator bugs that ADD keys (a ListItem "item"
// pointing at another product, the list's own url); microdata or RDFa; a wrong
// list on another public page; the real block hidden inside a moved </style>
// or a <template>; and a canonical link that was never tied to the domain. So
// this is an allowlist again, the house pattern: one exact spelling of a
// script tag, no microdata, no inert containers, exactly one ItemList type
// across every public page's parsed JSON-LD (keys and IRIs included) and in
// the raw text (duplicate keys that JSON.parse drops), exact keys on the list
// and its items, and the canonical link equal to the CNAME domain. A second,
// legitimate list (Vol. 2, say) is a deliberate change to this check, not
// something it should wave through.
//
// Re-attacked the same day, that allowlist leaked seven more ways, each a
// second list a conformant reader (jsonld.js 8.3.3, Chromium's DOM, pyRdfa3)
// read while verify stayed green. JSON-LD can assemble the type from halves
// the text never spells: an @vocab ending in "Item" with "@type": "List", or a
// prefix term with "il:List". And the microdata regex was a regex: HTML takes
// "/" as an attribute separator (<div/itemscope/…>), a quoted value may hold
// ">" (title="a>b" itemscope), RDFa can state a type with rel, property and
// resource, and stripping <style>…</style> before matching deleted a real list
// between two attribute values that merely spelled those tags. "&#76;" kept
// each one past the raw "ItemList" count, which never decodes references. So
// JSON-LD may now use the plain schema.org context and nothing else, with no
// key written twice, and tags are read with the HTML tokenizer's own rules.
const countOf = (needle) => html.split(needle).length - 1;
if (countOf(ITEMLIST_START) !== 1 || countOf(ITEMLIST_END) !== 1 ||
    html.indexOf(ITEMLIST_START) > html.indexOf(ITEMLIST_END)) {
  fail(
    `index.html must carry exactly one theme-itemlist marker pair, start before end; found ` +
      `${countOf(ITEMLIST_START)} start and ${countOf(ITEMLIST_END)} end marker(s).`,
  );
}
const itemListStart = html.indexOf(ITEMLIST_START);
const itemListEnd = html.indexOf(ITEMLIST_END);
const ALLOWED_SCRIPT_TAGS = new Set(['<script type="application/ld+json">', "<script>"]);
const INERT_CONTAINER = /<(template|noscript|textarea|xmp|plaintext|iframe|noembed|noframes)\b/i;
const RAW_SCAN_NOTE =
  "This check reads the raw page, comments, attribute values and CSS included, so a mention counts too: " +
  'write its "<" as &lt; or name the element in words.';
// htmlTags (scripts/html-tags.mjs) reads every start and end tag as the HTML
// tokenizer does; scripts/site-style.mjs reads the site's pages with it too.
// Inline <svg>, held to shapes. Inside one a browser reads <style>, <title> and
// <script> as markup rather than text, honours CDATA, and leaves it for HTML
// again at tags such as <p> or <font color> -- so the tags htmlTags reads there
// match the elements a browser builds only while every tag is a plain shape.
// familiars.html (main's #65) draws its familiar and sigils inline so its CSS
// can colour, animate and move them; inline <svg> was refused outright until
// 2026-10-24. Every tag in an inline <svg>, start or end, must be one of
// INLINE_SVG_ELEMENTS and carry only INLINE_SVG_ATTRIBUTES (or aria-*); no value
// may hold "&" (a character reference can spell url( ), "\" (a CSS escape can)
// or url( (a paint server can be fetched from another file); the <svg> must be
// closed; and nothing between <svg> and </svg> may start "<!", so there is no
// comment or CDATA section. Anything else goes in a file shown with <img>.
const INLINE_SVG_ELEMENTS = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const INLINE_SVG_ATTRIBUTES = new Set([
  "class", "id", "xmlns", "viewbox", "preserveaspectratio", "width", "height", "x", "y", "rx", "ry", "cx", "cy",
  "r", "x1", "y1", "x2", "y2", "d", "points", "transform", "fill", "fill-opacity", "fill-rule", "stroke",
  "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray",
  "stroke-dashoffset", "stroke-opacity", "opacity", "clip-rule", "vector-effect", "shape-rendering",
  "focusable", "role",
]);
const inlineSvgProblems = (markup, tags) => {
  const problems = [];
  let depth = 0;
  let from = 0;
  const region = (to) => {
    if (markup.slice(from, to).includes("<!")) problems.push('"<!" (a comment or CDATA)');
  };
  for (const tag of tags) {
    if (!tag.foreign) continue;
    const written = `<${tag.closing ? "/" : ""}${tag.name}>`;
    if (!INLINE_SVG_ELEMENTS.has(tag.name)) problems.push(written);
    for (const { name, value } of tag.attributes) {
      if (!INLINE_SVG_ATTRIBUTES.has(name) && !name.startsWith("aria-")) problems.push(`${name} on ${written}`);
      else if (/[&\\]|url\(/i.test(value)) problems.push(`${name}="${value}" on ${written}`);
      else if (name === "xmlns" && value !== "http://www.w3.org/2000/svg") problems.push(`xmlns="${value}"`);
    }
    if (tag.name !== "svg" || tag.selfClosing) continue;
    if (!tag.closing && depth++ === 0) from = tag.end;
    if (tag.closing && depth > 0 && --depth === 0) region(tag.start);
  }
  if (depth > 0) {
    region(markup.length);
    problems.push("no closing </svg>");
  }
  return [...new Set(problems)];
};
// Attributes that state structured data in microdata or RDFa. property and rel
// are RDFa too, but the site needs them, so they are held to what it uses:
// property only for the Open Graph family on <meta> (none of those prefixes can
// be pointed at rdf: once prefix and xmlns: are refused), and rel only as plain
// link types, since a ":" makes a rel token a CURIE or IRI ("rdf:type") and an
// "&" can spell one ("rdf&colon;type").
const STRUCTURED_DATA_ATTRIBUTES = new Set([
  "itemscope", "itemtype", "itemprop", "itemid", "itemref",
  "vocab", "typeof", "prefix", "about", "resource", "rev", "inlist", "datatype",
]);
const OPEN_GRAPH_PROPERTY = /^(og|article|book|profile|fb|twitter):[a-z_:]+$/;
// The first key a JSON-LD block writes twice in one object, if any. JSON.parse
// keeps the last of two equal keys, and a parser that keeps the first reads a
// different block. Strings are consumed whole, so a brace inside one is text.
const duplicateJsonKey = (text) => {
  const objects = [];
  for (const [token, key] of text.matchAll(/("(?:[^"\\]|\\.)*")(?=\s*:)|"(?:[^"\\]|\\.)*"|[{}]/g)) {
    if (token === "{") objects.push(new Set());
    else if (token === "}") objects.pop();
    else if (key !== undefined) {
      const name = JSON.parse(key);
      if (objects.at(-1)?.has(name)) return name;
      objects.at(-1)?.add(name);
    }
  }
  return undefined;
};
const contextKeyCount = (value) => {
  if (Array.isArray(value)) return value.reduce((count, child) => count + contextKeyCount(child), 0);
  if (value === null || typeof value !== "object") return 0;
  return Object.entries(value).reduce(
    (count, [key, child]) => count + (key === "@context" ? 1 : 0) + contextKeyCount(child),
    0,
  );
};
const isItemListType = (value) => typeof value === "string" && /(^|[/:#])ItemList$/i.test(value);
const itemListTypeMentions = (value) => {
  if (Array.isArray(value)) return value.reduce((count, child) => count + itemListTypeMentions(child), 0);
  if (value === null || typeof value !== "object") return isItemListType(value) ? 1 : 0;
  return Object.entries(value).reduce(
    (count, [key, child]) => count + (isItemListType(key) ? 1 : 0) + itemListTypeMentions(child),
    0,
  );
};
const ldJsonBlocks = (page, markup) =>
  [...markup.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((block) => {
    try {
      return { index: block.index, text: block[1], value: JSON.parse(block[1]) };
    } catch {
      fail(`${page} has a JSON-LD block that does not parse, at offset ${block.index}.`);
    }
  });
// Every HTML file Pages can serve, not only the root pages: a link on
// assets/social-preview.html reaches visitors too. Payment links belong only
// on the root pages, the ones the price checks read.
// ---------------------------------------------------------------------------
// One page per theme under theme/<slug>/ is rendered from the theme files by
// scripts/build-theme-pages.mjs. A page states hex values, measured ratios and
// an install command, so it is a public claim: every page on disk must be
// byte-for-byte what the builder renders from today's files, no page may exist
// for a theme that does not, and sitemap.xml must list each one (the builder
// owns the sitemap for that reason). These run before the guards every served
// page meets, so a page the builder does not render is reported as that first.
// ---------------------------------------------------------------------------
const { buildThemePages } = await import("./build-theme-pages.mjs");
const themePages = await buildThemePages(root);
// The builder also writes sitemap.xml; that file is compared at the end, after
// the sitemap's own document checks, so a malformed sitemap is reported as
// malformed and only a well-formed but stale one as stale.
const themePageFreshness = async (path, expected) => {
  let actual;
  try {
    actual = await readFile(new URL(path, root), "utf8");
  } catch {
    fail(`${path} is missing. Run node scripts/build-theme-pages.mjs and commit the result.`);
  }
  if (actual !== expected) {
    fail(
      `${path} is stale: it does not match what scripts/build-theme-pages.mjs renders from the ` +
        "theme files. Run it and commit the result.",
    );
  }
};
for (const [path, expected] of themePages) {
  if (path !== "sitemap.xml") await themePageFreshness(path, expected);
}
let themeDirectoryEntries;
try {
  themeDirectoryEntries = await readdir(new URL("theme/", root), { withFileTypes: true });
} catch {
  fail("theme/ is missing. Run node scripts/build-theme-pages.mjs and commit the result.");
}
for (const entry of themeDirectoryEntries) {
  const path = entry.isDirectory() ? `theme/${entry.name}/index.html` : `theme/${entry.name}`;
  if (!themePages.has(path)) {
    fail(`${path} has no theme behind it. Remove it, or add the theme and rebuild the pages.`);
  }
}
// The pages are public pages like the root ones: first-party favicon, no
// unverified product links, and the shared share image described one way.
for (const [path, source] of themePages) {
  if (!path.endsWith(".html")) continue;
  if (!source.includes('rel="icon" type="image/svg+xml" href="/favicon.svg"')) {
    fail(`${path} must expose the first-party SVG favicon.`);
  }
  // Captured to a delimiter, then split on "?"/"#", as every slug read here is
  // (CLAUDE.md, "Capture to a delimiter, never to a character class").
  for (const match of source.matchAll(/https:\/\/notgabriel\.gumroad\.com\/l\/([^"'\s<>]+)/g)) {
    const slug = match[1].split(/[?#]/)[0];
    if (!verifiedGumroadSlugs.has(slug)) {
      fail(`${path} contains an unverified or unavailable Gumroad product link: ${slug}.`);
    }
  }
  const image = source.match(/<meta property="og:image" content="([^"]+)">/);
  const ogAlt = source.match(/<meta property="og:image:alt" content="([^"]+)">/);
  if (!image || !ogAlt) fail(`${path} must ship an og:image with og:image:alt.`);
  const seen = sharedImageAlts.get(image[1]);
  if (seen && seen.alt !== ogAlt[1]) {
    fail(
      `${path} and ${seen.file} share ${image[1]} but describe it differently. ` +
        "One image gets one description.",
    );
  }
}

// ---------------------------------------------------------------------------
// Familiars (familiars.html) is the catalogue page for the Claude skills,
// plugins and themes this pack belongs to. It states how many familiars it
// shows, so the number word in its catalogue heading must match the cards on
// the page. Like every public page it carries the first-party favicon, an
// og:image described the same way for X, and the Impressum link the law needs.
// The storefront links it, and the sitemap lists it (rendered by the builder).
// ---------------------------------------------------------------------------
let familiarsHtml;
try {
  familiarsHtml = await readFile(new URL("familiars.html", root), "utf8");
} catch {
  fail("familiars.html is missing.");
}
const familiarsNumberWords = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve"];
const familiarsCountClaim = familiarsHtml.match(/<h2>(\w+) familiars, each with its sigil\.<\/h2>/);
if (!familiarsCountClaim) fail("Familiars: the catalogue heading that states the count is missing.");
const familiarsCards = (familiarsHtml.match(/<article class="card"/g) ?? []).length;
const familiarsStated = familiarsNumberWords.indexOf(familiarsCountClaim[1].toLowerCase());
if (familiarsStated !== familiarsCards) {
  fail(`Familiars: the heading says ${familiarsCountClaim[1]} familiars but the page shows ${familiarsCards} cards.`);
}
const familiarsContracts = [
  [/<html lang="en">/, "document language"],
  [/<link rel="icon" type="image\/svg\+xml" href="favicon\.svg">/, "first-party favicon"],
  [/<link rel="canonical" href="https:\/\/gabs-utilities\.com\/familiars\.html">/, "canonical address"],
  [/<a href="impressum\.html">Impressum<\/a>/, "Impressum link"],
  [/<main id="main">/, "main landmark"],
  [/<meta property="og:image" content="https:\/\/gabs-utilities\.com\/assets\/familiars-share\.png">/, "share image"],
];
const missingFamiliarsContracts = familiarsContracts
  .filter(([pattern]) => !pattern.test(familiarsHtml))
  .map(([, label]) => label);
if (missingFamiliarsContracts.length) {
  fail(`Familiars page is missing: ${missingFamiliarsContracts.join(", ")}.`);
}
const familiarsOgAlt = familiarsHtml.match(/<meta property="og:image:alt" content="([^"]+)">/);
const familiarsXAlt = familiarsHtml.match(/<meta name="twitter:image:alt" content="([^"]+)">/);
if (!familiarsOgAlt || !familiarsXAlt || familiarsOgAlt[1] !== familiarsXAlt[1]) {
  fail("Familiars: og:image:alt and twitter:image:alt must both exist and say the same thing.");
}
await verifyPng("assets/familiars-share.png", { label: "Familiars share image", width: 1280, height: 720 });
if (!/<a href="familiars\.html">[^<]+<\/a>/.test(html)) {
  fail("The storefront must link the Familiars page (familiars.html).");
}

const linkedPages = [
  ...publicHtmlFiles,
  ...(await readdir(root, { recursive: true }))
    .map((file) => file.split(sep).join("/"))
    .filter((file) => file.endsWith(".html") && file.includes("/") && !file.startsWith(".git/"))
    .sort(),
];
const readPage = (page) => page === "index.html"
  ? html
  : readFile(fileUrl(page), "utf8");
// The rules that keep htmlTags reading what a browser builds hold on every
// served page, not only the root ones: on assets/social-preview.html an inline
// <svg> decoded a script's text before Chromium hashed it, and a <!-- in a
// JSON-LD block ran on into a script htmlTags never saw.
let markedBlock;
const jsonLdBlocks = [];
for (const page of linkedPages) {
  const markup = await readPage(page);
  // The tokenizer hands a NUL to a script, an attribute or a tag name as
  // U+FFFD, so a script holding one hashes differently in Chromium, which
  // refused the gallery when verify had accepted its hash.
  const nul = markup.indexOf("\u0000");
  if (nul !== -1) {
    fail(
      `${page}:${markup.slice(0, nul).split("\n").length} holds a NUL character (U+0000). A browser reads it ` +
        `as U+FFFD, so the page it builds is not the file verify read; remove it.`,
    );
  }
  // These three read the raw page, not htmlTags' tags, so a mistake in that
  // reader cannot hide what they refuse. The cost is that a mention counts:
  // measured 2026-10-19, a <noscript> named in an HTML comment, an attribute
  // value or a CSS comment, and a commented-out <script src>, were refused. The
  // message says where, and how to write the mention instead.
  const where = (index) => `${page}:${markup.slice(0, index).split("\n").length}`;
  for (const { 0: tag, index } of markup.matchAll(/<script\b[^>]*>/gi)) {
    if (!ALLOWED_SCRIPT_TAGS.has(tag)) {
      fail(
        `${where(index)} has a script tag spelled ${JSON.stringify(tag)}. Only <script type="application/ld+json"> ` +
          `and <script> are allowed: a src loads code from a file verify does not read, and every JSON-LD ` +
          `block a crawler reads must be one this check reads. ${RAW_SCAN_NOTE}`,
      );
    }
  }
  for (const { 0: tag, index } of markup.matchAll(/<\/script\b[^>]*>/gi)) {
    if (tag !== "</script>") fail(`${where(index)} closes a script with ${JSON.stringify(tag)}; write </script>. ${RAW_SCAN_NOTE}`);
  }
  const container = markup.match(INERT_CONTAINER);
  if (container) {
    fail(
      `${where(container.index)} uses <${container[1]}>, which can hide structured data from crawlers or carry ` +
        `markup this check does not read. Nothing on the site needs one; remove it. ${RAW_SCAN_NOTE}`,
    );
  }
  const pageTags = htmlTags(markup);
  const svgProblems = inlineSvgProblems(markup, pageTags);
  if (svgProblems.length) {
    fail(
      `${page} has an inline <svg> holding ${svgProblems.join(", ")}. Inside an inline <svg> a browser reads ` +
        `<style>, <title> and CDATA as markup, so only shapes are allowed there: svg, g, path, rect, circle, ` +
        `ellipse, line, polyline and polygon, with geometry and paint attributes, no "&", "\\" or url( in a ` +
        `value, no comment or CDATA, and a closing </svg>. Put anything else in an .svg file shown with <img>.`,
    );
  }
  for (const tag of pageTags) {
    if (!tag.closing && tag.name === "math") {
      fail(
        `${page} has an inline <math>. Inside one a <style> is not raw text, so a browser ` +
          `reads tags there that this check cannot. Show the formula as an image or as text.`,
      );
    }
    const names = tag.attributes.map(({ name }) => name);
    const twice = names.find((name, index) => names.indexOf(name) !== index);
    if (twice !== undefined) {
      fail(
        `${page} writes ${twice} twice on one <${tag.name}>. A browser keeps the first and drops the rest, ` +
          `so a check that reads either one can disagree with it; write it once.`,
      );
    }
    if (tag.name === "script" && tag.text.includes("<!--")) {
      fail(
        `${page} has a <script> whose text holds "<!--". From there a browser can run the script ` +
          `past its </script> and swallow what follows, the theme ItemList included. Write the ` +
          `"<" as \\u003c in JSON, or reword it.`,
      );
    }
    for (const { name, value } of tag.attributes) {
      if (STRUCTURED_DATA_ATTRIBUTES.has(name) || name.startsWith("xmlns:") ||
          (name === "xmlns" && value !== "http://www.w3.org/1999/xhtml")) {
        fail(
          `${page} carries microdata or RDFa ("${name}" on <${tag.name}>); the site's structured ` +
            `data is JSON-LD only. Remove the attribute: Open Graph <meta property> tags need no ` +
            `prefix or xmlns declaration.`,
        );
      }
      if (name === "property" && !(tag.name === "meta" && OPEN_GRAPH_PROPERTY.test(value))) {
        fail(
          `${page} has property=${JSON.stringify(value)} on <${tag.name}>. RDFa reads property as ` +
            `structured data; only Open Graph properties (og:, article:, book:, profile:, fb:, ` +
            `twitter:) on <meta> are allowed.`,
        );
      }
      if (name === "rel" && /[:&]/.test(value)) {
        fail(
          `${page} has rel=${JSON.stringify(value)} on <${tag.name}>. A rel token with a ":" is an ` +
            `RDFa CURIE or IRI that can state a type; use plain link types, written out.`,
        );
      }
    }
  }
  const blocks = ldJsonBlocks(page, markup);
  const expected = page === "index.html" ? 1 : 0;
  const parsedMentions = blocks.reduce((count, block) => count + itemListTypeMentions(block.value), 0);
  const rawMentions = (markup.match(/ItemList/g) ?? []).length;
  if (parsedMentions !== expected || rawMentions !== expected) {
    fail(
      `${page} mentions the ItemList type ${parsedMentions} time(s) in its parsed JSON-LD and ` +
        `${rawMentions} time(s) in its text; it may carry ${expected === 1 ? "exactly one, the " +
        "generated theme list inside the theme-itemlist markers" : "none"}. A second list ` +
        `would hand crawlers two answers for what the gallery holds; adding one is a deliberate ` +
        `change to this check in scripts/verify.mjs.`,
    );
  }
  jsonLdBlocks.push(
    ...blocks.map((block) => ({ ...block, page, line: markup.slice(0, block.index).split("\n").length })),
  );
  if (page === "index.html") {
    const inside = blocks.filter((block) => block.index > itemListStart && block.index < itemListEnd);
    if (inside.length !== 1 || itemListTypeMentions(inside[0].value) !== 1) {
      fail("The theme-itemlist markers must hold exactly one JSON-LD block, the theme ItemList.");
    }
    markedBlock = inside[0];
  }
}
// Nothing may swallow the block: a <style> or <script> left open before the
// start marker turns it into raw text a crawler never parses as JSON-LD.
const beforeList = html.slice(0, itemListStart);
for (const element of ["style", "script"]) {
  const opened = (beforeList.match(new RegExp(`<${element}\\b`, "gi")) ?? []).length;
  const closed = (beforeList.match(new RegExp(`</${element}\\b`, "gi")) ?? []).length;
  if (opened !== closed) {
    fail(`A <${element}> is still open where the theme ItemList starts, so crawlers would read it as ${element} text.`);
  }
}
const crawlableList = markedBlock.value;
if (JSON.stringify(crawlableList) !== markedBlock.text) {
  fail(
    "The theme ItemList block is not exactly the compact JSON its own parse produces (a duplicate " +
      "key, or formatting the generator does not emit); one parser could read a different list.",
  );
}
const cname = (await readFile(new URL("CNAME", root), "utf8")).trim();
const siteUrl = `https://${cname}/`;
const canonicalLinks = [...html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<link\b[^>]*>/gi)]
  .map(([tag]) => tag)
  .filter((tag) => /\brel\s*=\s*["']?[^"'>]*\bcanonical\b/i.test(tag));
if (canonicalLinks.length !== 1) {
  fail(`index.html must carry exactly one canonical link; found ${canonicalLinks.length}.`);
}
const canonicalHref = canonicalLinks[0].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
let canonicalUrl;
try {
  canonicalUrl = new URL(canonicalHref?.[1] ?? canonicalHref?.[2] ?? canonicalHref?.[3]).href;
} catch {
  fail(`index.html's canonical link has no usable href: ${canonicalLinks[0]}`);
}
if (canonicalUrl !== siteUrl) {
  fail(`index.html's canonical link is ${canonicalUrl}, but CNAME serves the site at ${siteUrl}.`);
}
const rootThemeNames = [...rootNames];
const rootThemeIds = files.map((file) => file.replace(/\.json$/, ""));
if (crawlableList === null || typeof crawlableList !== "object" || Array.isArray(crawlableList)) {
  fail("The theme ItemList block must hold the ItemList object itself, as the generator emits it.");
}
if (crawlableList["@type"] !== "ItemList") {
  fail(`The theme ItemList's @type is ${JSON.stringify(crawlableList["@type"])}, not "ItemList".`);
}
if (crawlableList["@context"] !== "https://schema.org") {
  fail(`The theme ItemList's @context is ${JSON.stringify(crawlableList["@context"])}, not "https://schema.org".`);
}
const LIST_KEYS = ["@context", "@type", "itemListElement", "name", "numberOfItems"];
const LIST_ITEM_KEYS = ["@type", "name", "position", "url"];
const keysOf = (value) => JSON.stringify(Object.keys(value).sort());
if (keysOf(crawlableList) !== JSON.stringify(LIST_KEYS)) {
  fail(
    `The theme ItemList carries keys ${keysOf(crawlableList)}; it may carry exactly ` +
      `${JSON.stringify(LIST_KEYS)}. An extra key (a url, an @id, a description) tells crawlers ` +
      `something about the list that nothing here checks.`,
  );
}
if (crawlableList.name !== pluginManifest.displayName) {
  fail(
    `The theme ItemList is named ${JSON.stringify(crawlableList.name)}; the plugin it lists is ` +
      `"${pluginManifest.displayName}". The list's name comes from scripts/build-theme-index.mjs.`,
  );
}
const listItems = Array.isArray(crawlableList.itemListElement) ? crawlableList.itemListElement : [];
if (crawlableList.numberOfItems !== files.length || listItems.length !== files.length) {
  fail(
    `The theme ItemList says numberOfItems ${JSON.stringify(crawlableList.numberOfItems)} and lists ` +
      `${listItems.length}; ${files.length} theme files ship.`,
  );
}
const listedNames = listItems.map((item) => item?.name);
if (JSON.stringify(listedNames) !== JSON.stringify(rootThemeNames) &&
    JSON.stringify([...listedNames].sort()) === JSON.stringify([...rootThemeNames].sort())) {
  fail("The theme ItemList names every theme, but not in theme-file order, which is the order it is generated in.");
}
for (const [index, item] of listItems.entries()) {
  const where = `Theme ItemList element ${index + 1}`;
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    fail(`${where} is ${JSON.stringify(item)}, not a ListItem object.`);
  }
  if (item["@type"] !== "ListItem") fail(`${where} is a ${JSON.stringify(item["@type"])}, not a ListItem.`);
  if (keysOf(item) !== JSON.stringify(LIST_ITEM_KEYS)) {
    fail(
      `${where} carries keys ${keysOf(item)}; a ListItem here may carry exactly ` +
        `${JSON.stringify(LIST_ITEM_KEYS)}. An "item" or "sameAs" would point crawlers somewhere nothing checks.`,
    );
  }
  if (item.position !== index + 1) fail(`${where} has position ${JSON.stringify(item.position)}; positions run 1..${files.length}.`);
  if (item.name !== rootThemeNames[index]) {
    fail(`${where} is named ${JSON.stringify(item.name)}; theme file ${files[index]} is "${rootThemeNames[index]}".`);
  }
  const expectedUrl = new URL(`#theme-${rootThemeIds[index]}`, siteUrl).href;
  let listedUrl;
  try {
    listedUrl = new URL(item.url).href;
  } catch {
    fail(`${where} ("${item.name}") has url ${JSON.stringify(item.url)}, which is not an absolute URL.`);
  }
  if (listedUrl !== expectedUrl) fail(`${where} ("${item.name}") links ${JSON.stringify(item.url)}, not ${expectedUrl}.`);
}
// Every JSON-LD block on every page, after the theme list's own checks so a
// fault in that list is reported by the check written for it.
for (const block of jsonLdBlocks) {
  const where = `${block.page}'s JSON-LD block on line ${block.line}`;
  if (block.value === null || typeof block.value !== "object" || Array.isArray(block.value)) {
    fail(`${where} is not one object. Write one object, with several nodes under "@graph".`);
  }
  if (block.value["@context"] !== "https://schema.org" || contextKeyCount(block.value) !== 1) {
    fail(
      `${where} has @context ${JSON.stringify(block.value["@context"])} and ` +
        `${contextKeyCount(block.value)} @context key(s); it may have exactly one, at the top, ` +
        `exactly "https://schema.org", as every block on the site does. Any other context can ` +
        `build a type from pieces this check never sees spelled out (an @vocab ending in "Item" ` +
        `makes "List" an ItemList).`,
    );
  }
  const repeated = duplicateJsonKey(block.text);
  if (repeated !== undefined) {
    fail(
      `${where} writes the key ${JSON.stringify(repeated)} twice in one object. Parsers that keep ` +
        `the first and the last of them read different blocks; keep one.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Every link a browser can follow from a public page goes to a reviewed host,
// and a link to a payment host goes to a verified object on it.
//
// The Stripe ban above reads index.html as text, and the PayPal and Gumroad
// allowlists read every page as text, so each saw only the spelling it was
// written for. Reproduced 2026-10-18, each with verify green: a Stripe link on
// impressum.html; "buy.&#115;tripe.com", "buy.%73tripe.com" and
// "buy&period;stripe.com" on index.html, all of which Chromium resolves to
// https://buy.stripe.com/; a checkout on any other provider; a PayPal.me link
// and a PayPal donate button, which are PayPal payment links outside the NCP
// path the PayPal table guards; and an unverified NCP id and an unverified
// Gumroad slug, priced, behind "&period;". The last two are the EUR1,200 shape
// again: a payment link nobody read back, live on the shop.
//
// So links are read the way a browser reads them -- tags by htmlTags, each URL
// attribute resolved by the URL parser against the page's own address -- and
// the host is held to an allowlist, the house pattern: a list of forbidden
// providers goes stale the day a new one is used, and a custom checkout domain
// is on no list at all. A link off the site must also be spelled out as
// "https://<host>/" exactly, with "&" written "&amp;" and no other character
// reference, so the text-based price and slug checks above read every payment
// link in the spelling a browser follows. The URL parser also removes a tab or
// line break anywhere in a URL, which the text checks stop at: a verified NCP
// link followed by a tab and "?amount=1200" passed the PayPal table and is
// followed by Chromium as that id with that query, so a PayPal link may carry
// no query or fragment at all.
//
// The review of the first version found the rest, each reproduced with verify
// green: a line break, backslash or "./" after "https://notgabriel.gumroad.com/"
// resolved to a verified slug while the text checks, which need the literal
// "gumroad.com/l/", never priced the card -- so a link off the site must be
// written exactly as the URL parser writes it back; a GET form or an <img
// ismap> appended a query to a verified NCP link at click time, so forms,
// formaction and ismap are refused (no page uses them); an onclick handler
// navigated anywhere, and attributionsrc fetched anywhere, so both are refused;
// imagesrcset fetched from any host; a GitHub Sponsors page is a checkout for
// any account, so github.com is held to this repo's owner; and a page that
// opens with front matter goes through Jekyll's Liquid on GitHub Pages, which
// assembled an unverified NCP link from pieces verify read as a relative path,
// so no public page may open with it. What this does not cover: a <script>'s
// text (it may only be the bare tag, but what it runs is not read), and CSS,
// which can fetch from any host but cannot navigate.
// ---------------------------------------------------------------------------
const URL_ATTRIBUTES = new Set([
  "href", "src", "action", "formaction", "srcset", "poster", "data", "ping", "cite",
  "longdesc", "background", "manifest", "codebase", "icon", "imagesrcset",
]);
// Every other attribute a page may carry, besides data-* and aria-*. An
// allowlist, so an attribute that sends a request and is on no list yet
// (attributionsrc was one, until the review found it) fails closed.
const OTHER_ATTRIBUTES = new Set([
  "alt", "as", "autocomplete", "charset", "class", "colspan", "content", "crossorigin", "datetime",
  "decoding", "dir", "download", "fetchpriority", "for", "headers", "height", "hidden", "hreflang",
  "http-equiv", "id", "integrity", "label", "lang", "loading", "media", "name", "open", "placeholder",
  "property", "referrerpolicy", "rel", "role", "rowspan", "scope", "sizes", "spellcheck", "style",
  "tabindex", "target", "title", "translate", "type", "value", "width", "xmlns",
]);
// Domains that sell things. Each reviewed host on one must say which paths on
// it are verified objects, so adding a sibling host (paypal.me, www.gumroad.com)
// to the list below cannot open a payment path nobody checks.
const PAYMENT_DOMAIN = /(^|\.)(paypal\.com|paypal\.me|gumroad\.com|stripe\.com|agensi\.io)$/;
// Each entry names what a link there must be, and the rule, both read out when
// a link breaks it. They say only as much as the table behind them asserts: a
// PayPal id was read back off PayPal's own object; a Gumroad slug only shows the
// product is published, and says nothing of its price; the Agensi page was read
// back, but its card states no price, so none is checked.
const paymentPath = {
  "www.paypal.com": {
    object: "a verified payment object",
    rule: "at /ncp/payment/<id> for an id in verifiedPayPalLinks, with no query or fragment",
    allows: (url) =>
      url.search === "" && url.hash === "" &&
      verifiedPayPalIds.some((id) => url.pathname === `/ncp/payment/${id}`),
  },
  "notgabriel.gumroad.com": {
    object: "a product page in verifiedGumroadSlugs",
    rule: "at /l/<slug> for a slug in verifiedGumroadSlugs (a published product; its price is only " +
      "the one the page records); its other pages, the storefront included, may list products " +
      "nobody here has reviewed",
    allows: (url) => {
      const slug = url.pathname.match(/^\/l\/([^/]+)$/)?.[1];
      return slug !== undefined && verifiedGumroadSlugs.has(slug);
    },
  },
  // A marketplace product page, linked from the storefront and the README by
  // main's #58. Read back live on 2026-10-19 before its host was reviewed: HTTP
  // 200, the Claude Code Theme Setup Assistant skill, $12, sold through Agensi's
  // own checkout. The card says "Paid, on Agensi" and states no price, so no
  // price is checked against it; the host is held to that one page.
  "agensi.io": {
    object: "the reviewed Agensi product page",
    rule: "at /skills/claude-code-theme-setup-assistant, with no query or fragment",
    allows: (url) =>
      url.search === "" && url.hash === "" && url.pathname === "/skills/claude-code-theme-setup-assistant",
  },
};
// Hosts that are not payment hosts but serve a checkout on some paths: GitHub
// Sponsors takes money for any account at github.com/sponsors/<name>.
const ownerPath = {
  object: "a verified payment object",
  rule: "under /notgabriels-sys/; elsewhere on it a path can be any account's Sponsors checkout",
  allows: (url) => url.pathname.startsWith("/notgabriels-sys/"),
};
const hostPath = { ...paymentPath, "github.com": ownerPath, "raw.githubusercontent.com": ownerPath };
const reviewedLinkHosts = new Set([
  cname, `audio.${cname}`, `tools.${cname}`, "github.com", "raw.githubusercontent.com",
  "notgabriels-sys.github.io", "opensource.org", "thedevtoolsdir.com", "www.producthunt.com",
  "help.producthunt.com",
  // The README's two status badges (main's #70): images that state the verify
  // run on main and the licence. Nothing on the host takes money; GitHub shows
  // them through its own image proxy, while the rendered note on the site loads
  // them from shields.io directly. A badge URL with a second query parameter
  // needs an "&", which the note check refuses, so the verify badge carries
  // only ?branch=main.
  "img.shields.io",
  ...Object.keys(paymentPath),
]);
for (const host of reviewedLinkHosts) {
  if (PAYMENT_DOMAIN.test(host) && !paymentPath[host]) {
    fail(`${host} is a reviewed link host on a payment domain with no entry in paymentPath saying which paths are verified.`);
  }
}
// Inline scripts. The link check reads URLs, and a script navigates without
// one: location.assign(...) added to index.html's gallery script, or a second
// bare <script>, passed verify on 2026-10-18 and sent Chromium to another host.
// So every script a served page runs is held to reviewedInlineScripts by the
// SHA-256 of its text, hashed as a browser hashes it -- a changed or added
// script is a deliberate edit here, like a new host in reviewedLinkHosts --
// and each page carries a Content-Security-Policy naming exactly those hashes,
// so the browser itself refuses any other script. The rest of the policy turns
// off what the checks above refuse by reading: workers, plugins, frames, <base>
// and form posts. This reviews; it does not read what a script does.
const reviewedInlineScripts = new Map([
  // The storefront (read 2026-10-31 for #72). In <head>, before the first paint: applies the
  // theme and the motion pause saved under familiars-theme and familiars-motion, as data-theme
  // and data-motion on the root. Then the gallery: renders THEMES and VOL2_THEMES, filters and
  // copies install commands; the light/dark switch and the motion switch, each saving its choice
  // under those keys and writing only its own label's text, the motion switch and a change of the
  // motion setting also marking the hero .risen so its entrance plays once; a scrollBy that moves keyboard focus clear of the
  // floating switch, never a tap's or a click's; and the pointer light, which sets --mx and --my
  // on the .lit surfaces. It loads, fetches and navigates nothing.
  ["index.html", ["sha256-NIZ5jxPqHe76C4AEHPJCjXNeTRDJC4LsWQG/g6melI4=", "sha256-yQjCaHNN9EhMHqdGIwFELVT3c7GPz7YUCbH1jKu7ogE="]],
  // Familiars (main's #65, read 2026-10-24): the light/dark switch, kept in
  // localStorage; the kind filter; a pointer-following light on each card; the
  // copy button, which writes the request address to the clipboard; and the
  // familiar's eye, which follows the pointer and blinks. It loads, fetches and
  // navigates nothing, and writes no markup.
  ["familiars.html", ["sha256-tW017ch2iUy4IDsMqdWpXKZStidvDhnxjoIcLgbw5vY="]],
]);
// Every page under theme/ is rendered by scripts/build-theme-pages.mjs (main's
// #59) and runs one script, the same on each: its copy button, which writes a
// button's data-copy text to the clipboard and changes the button's label for
// 1.4 s. It reads nothing else, and loads and navigates nowhere. Read
// 2026-10-19 when #59 was merged here; one entry holds for every generated
// page the builder renders, so a change to that script is still one deliberate
// edit, and a page it does not render gets no reviewed script.
const reviewedThemePageScripts = ["sha256-a45E5Riw8az2PUDhD9sCmfIbb20+7UZqWfjQXdb0TmU="];
const reviewedScriptsFor = (page) =>
  reviewedInlineScripts.get(page) ?? (themePages.has(page) ? reviewedThemePageScripts : []);
const POLICY_REST = "worker-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const scriptHash = (text) =>
  `sha256-${createHash("sha256").update(text.replace(/\r\n?/g, "\n"), "utf8").digest("base64")}`;
const expectedPolicy = (hashes) =>
  `script-src ${hashes.length ? hashes.map((hash) => `'${hash}'`).join(" ") : "'none'"}; ${POLICY_REST}`;
// Schemes that reach no web page, and image data an <img> or a poster shows
// but cannot follow.
const NO_WEB_HOST = new Set(["mailto:", "tel:", "sms:"]);
const IMAGE_ATTRIBUTES = new Set(["img src", "img srcset", "source src", "source srcset", "video poster"]);
// The URLs in a srcset, as the HTML "parse a srcset attribute" steps find
// them: a URL may hold commas (an image CDN's "w-640,h-480"), and only a comma
// after a URL's descriptors, outside parentheses, starts the next candidate.
const srcsetUrls = (value) => {
  const urls = [];
  let at = 0;
  for (;;) {
    while (at < value.length && /[\t\n\f\r ,]/.test(value[at])) at++;
    if (at >= value.length) return urls;
    const from = at;
    while (at < value.length && !HTML_SPACE.test(value[at])) at++;
    const url = value.slice(from, at);
    urls.push(url.replace(/,+$/, ""));
    if (url.endsWith(",")) continue;
    let inParens = false;
    while (at < value.length && (inParens || value[at] !== ",")) {
      if (value[at] === "(") inParens = true;
      else if (value[at] === ")") inParens = false;
      at++;
    }
  }
};
// Why a link off the site is not written as "https://<host>/", in words a
// contributor can act on.
const spellingProblem = (spelled, host) => {
  if (spelled !== spelled.trim()) return "it starts or ends with whitespace";
  if (/[\t\n\r]/.test(spelled)) return "it holds a tab or line break, which a browser removes";
  if (!/^https:\/\//.test(spelled)) return `it does not start with "https://"`;
  const written = spelled.slice("https://".length).split(/[/?#]/)[0];
  if (written.includes("@")) return "it carries a user name before the host";
  if (/:\d*$/.test(written)) return "it names a port";
  if (written.toLowerCase() !== host) return `the host is written "${written}"`;
  if (!spelled.startsWith(`https://${host}/`)) return `"/" must follow the host`;
  return `a browser normalises it to ${new URL(spelled).href}; write that`;
};
const stripeLine = (text) => {
  const at = text.search(/stripe/i);
  if (at === -1) return null;
  const word = text.slice(0, at).match(/\w*$/)[0] + text.slice(at).match(/^\w*/)[0];
  return { line: text.slice(0, at).split("\n").length, word };
};
const stripeBan = (file, text) => {
  const found = stripeLine(text);
  if (found) {
    fail(
      `${file}:${found.line} contains "${found.word}". No Stripe link is verified for this site, and the ban is ` +
        `a case-insensitive substring match because a Stripe checkout can be named in many ways; reword it.`,
    );
  }
};
for (const page of linkedPages) {
  const markup = await readPage(page);
  stripeBan(page, markup);
  if (/^\uFEFF?---/.test(markup)) {
    fail(
      `${page} opens with "---". GitHub Pages runs a page with front matter through Jekyll's Liquid, so the ` +
        `page it serves is not the file verify read. Remove the front matter.`,
    );
  }
  for (const tag of htmlTags(markup)) {
    if (tag.closing) continue;
    if (tag.name === "base" && tag.attributes.some(({ name }) => name === "href")) {
      fail(`${page} has a <base href>, which changes where every relative link goes. Remove it.`);
    }
    if (tag.name === "meta" &&
        tag.attributes.some(({ name, value }) => name === "http-equiv" && value.trim().toLowerCase() === "refresh")) {
      fail(`${page} has a <meta http-equiv="refresh">, which sends the visitor somewhere. Link to the page instead.`);
    }
    if (tag.name === "form") {
      fail(`${page} has a <form>, which sends its fields to its action as a query. Nothing on the site needs one.`);
    }
    for (const { name, value } of tag.attributes) {
      if (name.startsWith("on") || ["formaction", "ismap", "attributionsrc"].includes(name)) {
        fail(
          `${page} has ${name} on <${tag.name}>, which can send the visitor or a request somewhere this check ` +
            `does not read. Nothing on the site needs it; use a plain link.`,
        );
      }
      // Inside an inline <svg> the page check above holds every attribute to
      // INLINE_SVG_ATTRIBUTES instead.
      if (!tag.foreign && !URL_ATTRIBUTES.has(name) && !OTHER_ATTRIBUTES.has(name) &&
          !name.startsWith("data-") && !name.startsWith("aria-")) {
        fail(
          `${page} has ${name} on <${tag.name}>, an attribute this check does not know. Some attributes send a ` +
            `request (attributionsrc did); once you have checked this one sends none, add it to ` +
            `OTHER_ATTRIBUTES in scripts/verify.mjs.`,
        );
      }
      if (!URL_ATTRIBUTES.has(name)) continue;
      const written = name === "srcset" || name === "imagesrcset" ? srcsetUrls(value)
        : name === "ping" ? value.split(/[\t\n\f\r ]+/).filter(Boolean)
        : [value];
      for (const raw of written) {
        const where = `${page} <${tag.name} ${name}="${name.endsWith("srcset") ? value : raw}">`;
        const spelled = raw.replaceAll("&amp;", "&");
        if (raw.replaceAll("&amp;", "").includes("&")) {
          fail(
            `${where} has an "&" not written "&amp;". In an attribute "&" can start a character reference that ` +
              `changes the URL a browser follows; write every "&" as "&amp;" and spell every other character out.`,
          );
        }
        let url;
        try {
          url = new URL(spelled, `https://${cname}/${urlPath(page)}`);
        } catch {
          fail(`${where} is not a URL a browser can resolve.`);
        }
        if (NO_WEB_HOST.has(url.protocol)) continue;
        if (url.protocol === "data:" && IMAGE_ATTRIBUTES.has(`${tag.name} ${name}`) &&
            /^data:image\//i.test(spelled.trim())) continue;
        if (url.protocol !== "https:") {
          fail(
            `${where} uses ${url.protocol}. Links on the site are https:, mailto:, tel: or sms:; save an image ` +
              `under assets/ and reference it by a relative path.`,
          );
        }
        if (url.host !== cname && spelled !== url.href) {
          fail(
            `${where} reaches ${url.host}, but ${spellingProblem(spelled, url.host)}. A link off the site is ` +
              `written exactly "https://${url.host}/...", the form a browser follows, so the price and slug ` +
              `checks read it.`,
          );
        }
        if (!reviewedLinkHosts.has(url.host)) {
          fail(
            `${where} links to ${url.host}, which is not a reviewed link host. A checkout on any provider is a ` +
              `payment surface and goes on the site only after its real object is read (CLAUDE.md, Payment ` +
              `surfaces). For an ordinary link, add the host to reviewedLinkHosts in scripts/verify.mjs.`,
          );
        }
        if (paymentPath[url.host] && !publicHtmlFiles.includes(page)) {
          fail(`${where} links to ${url.host} from a page the price checks do not read. Put payment links on a root page.`);
        }
        const path = hostPath[url.host];
        if (path && !path.allows(url)) {
          fail(
            `${where} goes to ${url.host}${url.pathname}${url.search}${url.hash}, which is not ` +
              `${path.object}. ${url.host} may be linked only ${path.rule}.`,
          );
        }
      }
    }
  }
  // A page without a doctype renders in quirks mode, where Chromium applies a
  // served .txt or .json as a stylesheet, and that CSS can fetch from any host.
  if (!/^\uFEFF?<!doctype html>/i.test(markup)) {
    fail(`${page} must open with <!doctype html>. Without it the page renders in quirks mode, which loads text files as CSS.`);
  }
  const tags = htmlTags(markup);
  const running = tags.filter((tag) => tag.name === "script" && !tag.closing && tag.attributes.length === 0);
  const reviewed = reviewedScriptsFor(page);
  const hashes = running.map((tag) => scriptHash(tag.text));
  const policy = `<meta http-equiv="Content-Security-Policy" content="${expectedPolicy(hashes)}">`;
  const unreviewed = hashes.filter((hash) => !reviewed.includes(hash));
  const stale = reviewed.filter((hash) => !hashes.includes(hash));
  if (unreviewed.length) {
    fail(
      `${page} runs an inline script nobody has reviewed (${unreviewed[0]}). A script can navigate or load ` +
        `without a link, so read it first; then ${stale.length ? `replace ${stale[0]} with it` : "add it"} in ` +
        `reviewedInlineScripts for ${page} in scripts/verify.mjs, and use this Content-Security-Policy: ${policy}`,
    );
  }
  if (stale.length) {
    fail(`reviewedInlineScripts lists ${stale[0]} for ${page}, which no longer runs it. Remove that hash from the entry.`);
  }
  // The policy must come before anything it governs: right after <meta charset>,
  // with only whitespace between. Anything else there -- a stray ">", a
  // no-break space, an end tag such as </html> -- ends the head in a browser,
  // and a policy in the body is ignored: Chromium then ran an unreviewed script
  // while verify read the policy as present. (A second http-equiv on the
  // policy, which a browser reads first, is refused with every repeated
  // attribute above.)
  const policies = tags.filter((tag) => tag.name === "meta" && tag.attributes.some(
    ({ name, value }) => name === "http-equiv" && value.toLowerCase() === "content-security-policy"));
  if (policies.length !== 1) {
    fail(`${page} carries ${policies.length} Content-Security-Policy metas; it must carry exactly one: ${policy}`);
  }
  const before = tags.filter((tag) => tag.start < policies[0].start);
  const intruder = before.find((tag) => tag.closing || (!["html", "head"].includes(tag.name) &&
    !(tag.name === "meta" && tag.attributes.some(({ name }) => name === "charset"))));
  let gap = markup.slice(0, policies[0].start);
  for (const tag of [...before].reverse()) gap = gap.slice(0, tag.start) + gap.slice(tag.end);
  const stray = gap.replace(/^\uFEFF?<!doctype html>/i, "").replace(/[\t\n\f\r ]+/g, "");
  if (intruder || stray) {
    fail(
      `${page}'s Content-Security-Policy must come right after <meta charset>, with only whitespace between; ` +
        (intruder
          ? `<${intruder.closing ? "/" : ""}${intruder.name}> comes before it.`
          : `the text "${stray.replace(/[^\x21-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)}" ` +
            `comes before it.`),
    );
  }
  const content = policies[0].attributes.find(({ name }) => name === "content")?.value;
  if (content !== expectedPolicy(hashes)) {
    fail(
      `${page}'s Content-Security-Policy must read exactly, on one line, with the hashes in page order: ${policy}`,
    );
  }
}
for (const text of ["README.md", "llms.txt"]) stripeBan(text, await readFile(new URL(text, root), "utf8"));

// ---------------------------------------------------------------------------
// GitHub Pages serves more than the files above. The repo has no .nojekyll, so
// Pages runs Jekyll with its default plugins, and every Markdown file outside a
// "." or "_" directory becomes an HTML page on the shop's domain -- read back
// 2026-10-18: https://gabs-utilities.com/CLAUDE.html returns 200, generated by
// Jekyll 3.10.0. Reproduced with Jekyll 3.10.0, kramdown's GFM parser and the
// Pages default plugins, with verify green: a note ending in
// "[Mastering · EUR45](https://www.paypal.com/ncp/payment/<unverified>)", an
// autolink to another checkout and a raw-HTML PayPal.me link all rendered as
// live links on PROMOTION_QUEUE.html. (A bare URL renders as text.)
//
// verify does not run Jekyll, so it reads the Markdown conservatively: every
// destination a note could render -- inline links and images, reference
// definitions, <scheme:...> autolinks, and URL attributes in raw HTML or in a
// kramdown {: ...} attribute list -- found anywhere in the text, code spans
// included. Reading code as if it were live only adds candidates; it never
// hides one, which is the direction a markup reader must err in when it does
// not model the format (reading <title> text as markup hid a tag; reading code
// as links cannot hide a link). Each must stay on the site or reach a reviewed
// host, and never a payment host: the price checks do not read notes. Jekyll
// can also change pages wholesale, so a served note may carry front matter only
// as name, title and description (a permalink of /index.html would replace the
// storefront), no Liquid delimiters, and the root no "_" entry (_config.yml,
// _layouts, _includes) that would reshape the build.
// ---------------------------------------------------------------------------
for (const entry of await readdir(root)) {
  if (entry.startsWith("_")) {
    fail(
      `${entry} changes what GitHub Pages builds (a Jekyll config, layout, include or data file), and verify ` +
        `reads the files, not the build. Remove it.`,
    );
  }
}
// Every file Pages can serve. Jekyll skips any path with a segment starting
// "." or "_" -- except that its default include, ".htaccess", is matched as a
// prefix of any file or directory name, so .htaccess.svg or
// .htaccess-shop/pay.md is published. Nothing here needs one, so one is
// refused rather than read. Jekyll also skips names starting "#" or "~" or
// ending "~" and its default excludes (node_modules, vendor/bundle, Gemfile);
// verify reads those as served, which only refuses more.
//
// Pages builds from what is committed, so a file git ignores never reaches it:
// running a product's generator writes products/*/pack/, which is ignored, and
// must not turn a local run red. Where the tree is a repository it is read as
// git would commit it -- tracked files, and untracked ones git does not ignore,
// so a file about to be added is read too. Without one (the test fixtures,
// which copy only that set), or if git cannot run, it is walked whole, which
// only refuses more.
const committable = async () => {
  if (!(await stat(new URL(".git", root)).then(() => true, () => false))) return null;
  try {
    return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: fileURLToPath(root),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).split("\0").filter(Boolean);
  } catch {
    return null;
  }
};
const servedFiles = [];
for (const entry of (await committable()) ?? (await readdir(root, { recursive: true }))) {
  const file = entry.split(sep).join("/");
  const parts = file.split("/");
  if (parts.some((part) => /^[._]/.test(part) && !part.startsWith(".htaccess"))) continue;
  if (parts.some((part) => part.startsWith(".htaccess"))) {
    fail(
      `${file} is published by GitHub Pages: Jekyll's default include, ".htaccess", matches any name that ` +
        `starts with it, although other names starting with "." are skipped. Rename it.`,
    );
  }
  // A file git still tracks may be gone from the working tree; it is not served.
  const info = await lstat(fileUrl(file)).catch(() => null);
  if (!info) continue;
  if (info.isSymbolicLink()) {
    fail(
      `${file} is a symlink. Jekyll publishes what a link points at under the link's own name, so a visitor ` +
        `gets a file verify did not read there. Replace it with a copy.`,
    );
  }
  if (info.isDirectory()) continue;
  servedFiles.push(file);
}
servedFiles.sort();
const servedNotes = servedFiles.filter((file) => file.endsWith(".md"));
// Stated counts, on the files that state the packs' size to a reader: every
// served page and every served note and text file — the root text files
// (llms.txt), every README, the promotion drafts at the root and under
// assets/, and every file of the skills that ship to installers — but not the
// working notes: CLAUDE.md and CONTRIBUTING.md narrate history and
// measurements by design, docs/ holds dated records, and products/ describes
// the audio packs, where "atmospheres" and "palettes" are sound terms. The
// review of 453ff81 reproduced the cost of reading those: dated history,
// quoted stale copy and an audio pack's "8 evolving low atmospheres" were each
// refused. (Until the re-attack of 2026-10-19 this read only root notes,
// READMEs and SKILL.md, and missed a launch draft under assets/ and a skill's
// own reference files.) Scripts and data are not prose and are not read; the
// plugin manifests' descriptions, which installers read, are read below.
const countSurface = (file) =>
  /\.html$/i.test(file) ||
  (/\.(txt|md)$/i.test(file) && !/^(products|docs)\//.test(file) && !["CLAUDE.md", "CONTRIBUTING.md"].includes(file));
// "<number> [up to two words] role-aware [up to two words] checks|comparisons":
// the noun is part of the claim, so "3 role-aware rules" is not one, and a
// number joined to the text before ("WCAG 2.1", "7:1") is not read. A comma
// joins digits only as a thousands separator: in "Since Vol. 2, role-aware
// checks" no number is claimed. A count "per theme" or "for each theme" is a
// part, not the total.
const roleAwarePattern =
  /(?<![\w.,:\/-])(\d{1,3}(?:,\d{3})+|\d+)(?![\d,]\d)\+?((?:\s+(?!\d)[\w-]+){0,2})\s+role[\s-]aware((?:\s+[\w-]+){0,2}?)\s+(?:checks?|comparisons?)\b(?!\s+(?:per|each|for\s+each|in\s+each|in\s+every)\b)/gi;
const statedCountFailures = (surface, texts) => {
  const failures = [];
  const stale = themeCountFailure(surface, texts);
  if (stale) failures.push(stale);
  for (const text of texts) {
    for (const match of text.matchAll(roleAwarePattern)) {
      const value = Number.parseInt(match[1].replace(/,/g, ""), 10);
      if (value !== roleAwareComparisonCount) {
        failures.push(
          `${surface}:${lineAt(text, match.index)} claims ${value} role-aware checks; the verifier runs ` +
            `${roleAwareComparisonCount}.`,
        );
      }
    }
  }
  return failures;
};
// An install from this marketplace works only once the marketplace is added:
// on a fresh machine "claude plugin install dark-themes-vol-2@notgabriels-themes"
// alone fails. llms.txt, which an agent reads and runs, gave exactly that, and
// so did the DEV draft and the Vol. 2 X post. So wherever a reader-facing file
// shows such an install, the marketplace add comes first in the same file.
const MARKETPLACE_ADD = /claude\s+plugin\s+marketplace\s+add\s+notgabriels-sys\/claude-code-50-dark-themes(?![\w-]|\.[\w-])/;
const MARKETPLACE_INSTALL = /claude\s+plugin\s+install\s+([^\s@]+)@notgabriels-themes/g;
for (const surface of servedFiles.filter(countSurface)) {
  const texts = proseText(await readFile(fileUrl(surface), "utf8"));
  for (const failure of statedCountFailures(surface, texts)) {
    fail(failure);
  }
  const added = texts[0].search(MARKETPLACE_ADD);
  for (const install of texts[0].matchAll(MARKETPLACE_INSTALL)) {
    if (added < 0 || added > install.index) {
      fail(
        `${surface}:${lineAt(texts[0], install.index)} installs ${install[1]}@notgabriels-themes before the ` +
          "marketplace is added, which fails on a fresh machine. Put \"claude plugin marketplace add " +
          'notgabriels-sys/claude-code-50-dark-themes" before it in the same file.',
      );
    }
  }
}
// The plugin manifests are not served, but installers read their
// descriptions: the marketplace's own and each plugin's, in marketplace.json
// and in every plugin.json. Only the description strings are read, each on its
// line; the description guard above reads only their opening count.
for (const manifest of [
  ".claude-plugin/marketplace.json",
  ...expectedPlugins.map(({ name }) => `plugins/${name}/.claude-plugin/plugin.json`),
]) {
  const raw = await readFile(new URL(manifest, root), "utf8");
  const descriptions = raw.replace(/"description"[ \t]*:[ \t]*("(?:[^"\\\n]|\\.)*")|[^\n]/g, (whole, literal) =>
    literal === undefined ? "" : ` ${JSON.parse(literal)} `,
  );
  for (const failure of statedCountFailures(manifest, [descriptions])) fail(failure);
}
const NOTE_LINK_PATTERNS = [
  // [text](url) and ![alt](url), with or without <...> around the url.
  /\]\(\s*<?([^\s)>]+)/g,
  // [id]: url -- anywhere on a line, not only at its start: kramdown reads a
  // definition inside a blockquote, a list item or a definition list too.
  /\[[^\]\n]+\]:[ \t]*<?([^\s>]+)/g,
  // <https://...>, <mailto:...>
  /<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*)>/g,
  // href="..." and every other URL attribute, in raw HTML or {: ...}.
  new RegExp(
    `(?:^|[\\s"'/<{:])(?:${[...URL_ATTRIBUTES, "attributionsrc"].join("|")})\\s*=\\s*` +
      `(?:"([^"]*)"|'([^']*)'|([^\\s>}]+))`,
    "gi",
  ),
];
const checkNote = (note, text) => {
  const frontMatter = text.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (/^\uFEFF?---/.test(text) && !frontMatter) {
    fail(`${note} opens with "---" but its front matter does not close; Jekyll reads it differently from verify.`);
  }
  for (const key of (frontMatter?.[1] ?? "").matchAll(/^([^\s#:][^:]*):/gm)) {
    if (!["name", "title", "description"].includes(key[1].trim())) {
      fail(
        `${note} sets "${key[1].trim()}" in its front matter. Pages builds the note through Jekyll, and keys ` +
          `like permalink or layout change what the site serves; a note may set only name, title and description.`,
      );
    }
  }
  if (/\{\{|\{%/.test(text)) {
    fail(`${note} holds a Liquid delimiter ("{{" or "{%"), which Jekyll can turn into a link verify never read.`);
  }
  // kramdown passes a note's raw HTML through to the page, and its attribute
  // lists add attributes, so a note can run script without a link. Reproduced
  // with verify green: a script element, an onerror handler, a meta refresh, an
  // iframe srcdoc and an onclick set by a {: ...} list each sent Chromium to
  // another host from the rendered note. HTML builds a name it does not know --
  // the <id> and <name> placeholders notes write -- as an inert element, so
  // this is a list of the elements that do something: run script, refresh,
  // rebase links, embed a document, or hold foreign content that can do these.
  // Read anywhere, code included, like links; describe them in words instead.
  // HTML attribute names ignore case, so prose such as "Online = later" reads
  // as a handler too: the cost of reading conservatively.
  const active = text.match(/<(script|meta|base|iframe|frame|frameset|object|embed|applet|portal|fencedframe|svg|math)(?=[\s/>]|$)/i) ??
    text.match(/(?:^|[\s"'/<{:;])(on[a-z]+)[\t\n\f\r ]*=/i);
  if (active) {
    fail(
      `${note}:${text.slice(0, active.index).split("\n").length} has "${active[0].trim()}", which can run script or ` +
        `load another page from the note Pages renders. Describe it in words; write "a script element", not the tag.`,
    );
  }
  const pageUrl = `https://${cname}/${urlPath(note.replace(/\.md$/, ".html"))}`;
  for (const pattern of NOTE_LINK_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const raw = match.slice(1).find((group) => group !== undefined);
      if (raw === undefined || raw === "") continue;
      const line = text.slice(0, match.index).split("\n").length;
      const where = `${note}:${line} (${raw})`;
      if (raw.replaceAll("&amp;", "").includes("&") || raw.includes("\\")) {
        fail(`${where} spells a link with a character reference or a backslash escape. Write the URL out.`);
      }
      let url;
      try {
        url = new URL(raw.replaceAll("&amp;", "&"), pageUrl);
      } catch {
        fail(`${where} is a link Jekyll would render that no browser can resolve.`);
      }
      if (NO_WEB_HOST.has(url.protocol)) continue;
      if (url.protocol !== "https:") fail(`${where} is a ${url.protocol} link; links in notes are https:, mailto:, tel: or sms:.`);
      // README.md is the one note whose prices are read, line by line, above.
      if (paymentPath[url.host] && note !== "README.md") {
        fail(
          `${where} links to ${url.host} from a note, which Pages serves as a page the price checks do not ` +
            `read. Payment links go on the root pages only.`,
        );
      }
      if (!reviewedLinkHosts.has(url.host)) {
        fail(
          `${where} links to ${url.host}, which is not a reviewed link host. Pages serves this note as a page on ` +
            `${cname}; add the host to reviewedLinkHosts deliberately, and never a checkout host.`,
        );
      }
      if (hostPath[url.host] && !hostPath[url.host].allows(url)) {
        fail(`${where} goes to ${url.host}${url.pathname}; ${url.host} may be linked only ${hostPath[url.host].rule}.`);
      }
    }
  }
};
for (const note of servedNotes) {
  checkNote(note, await readFile(fileUrl(note), "utf8"));
}

// ---------------------------------------------------------------------------
// Every file Pages serves is one verify reads, or one no browser opens as a
// page. The link check reads .html and the note check .md, and Pages serves
// more. Reproduced 2026-10-18 with verify green, each linking a checkout:
// pay.htm, pay.xhtml and pay.HTML; pay.markdown, which Jekyll renders to
// pay.html (so do .mkd, .mkdn, .mkdown and .MD); favicon.svg holding an <a> or
// a <script>; sitemap.xml turned into an HTML page by an <?xml-stylesheet?>; an
// XHTML page saved as .xml; and an SVG opening with front matter, which Jekyll
// runs through Liquid like any other file -- Liquid wrote an <a href> into it.
// Read back through Firecrawl the same day: Pages serves favicon.svg as
// image/svg+xml, a document a browser renders, links and scripts included;
// install.sh as application/x-sh, scripts/verify.mjs as text/javascript, and
// LICENSE and a .swift file as application/octet-stream.
//
// So served types are an allowlist: a page is .html and a note .md, both read
// above; an SVG or XML document is read below against allowlists of its own;
// every other type is one a browser shows as an image or as text, or saves. A
// new type is a deliberate edit here, once you know how a browser opens it.
// ---------------------------------------------------------------------------
const SERVED_TYPES = new Map([
  ["html", "page"],
  ["md", "note"],
  ["svg", "svg"],
  ["xml", "sitemap"],
  // Images and audio a browser shows or plays, and never reads as markup.
  ["png", "inert"],
  ["jpg", "inert"],
  ["jpeg", "inert"],
  ["webp", "inert"],
  ["gif", "inert"],
  ["ico", "inert"],
  ["mp3", "inert"],
  // A web font, loaded only through a page's @font-face; opened directly it is
  // saved, and it runs nothing. Self-hosted so a page asks no other host for
  // its type (familiars.html loaded Google Fonts until 2026-10-24).
  ["woff2", "inert"],
  // Terminal colour schemes (main's #68, terminal-schemes/): config files a
  // terminal reads. GitHub Pages types a file by its extension from mime-db:
  // .toml as application/toml and .colorscheme, which mime-db does not know,
  // as application/octet-stream, both saved; .conf as text/plain and .yaml as
  // text/yaml, shown as text or saved. Not read back live (2026-10-24: the site
  // is out of this session's reach and Firecrawl out of credits), so no
  // reading of them may matter: none can open as a page.
  ["toml", "inert"],
  ["yaml", "inert"],
  ["conf", "inert"],
  ["colorscheme", "inert"],
  // iTerm2's and Terminal.app's schemes are XML property lists, read below as
  // plists, so that even served as XML they build no page.
  ["itermcolors", "plist"],
  ["terminal", "plist"],
  ["json", "inert"],
  ["txt", "inert"],
  // text/javascript, shown as text when opened. A page loads it only through
  // inline script (an import, a worker, a service worker), and inline script
  // text is not covered -- so one is refused where a service worker
  // registered from it would control a page; see below.
  ["mjs", "inert"],
  ["zip", "inert"],
  ["sh", "inert"],
  ["swift", "inert"],
  // Source a contributor runs, like .sh and .swift (main's #70 added
  // scripts/build-readme-hero.py): text/x-python by mime-db, not read back
  // live, shown as text or saved. Every page is in standards mode and loads no
  // script by src, so none can use it as a stylesheet or a script.
  ["py", "inert"],
  // No extension: LICENSE, served as application/octet-stream.
  ["", "inert"],
]);
// An SVG or XML file is a document when a browser opens it, with the links,
// scripts and stylesheets XML allows. verify does not parse it. It refuses
// every construct that lets the markup a browser builds differ from the text:
// another encoding, a doctype with an internal subset (whose entities expand
// into markup, and whose ATTLIST defaults an onload), CDATA, a processing
// instruction (an <?xml-stylesheet?> turns the file into another document), a
// character reference. What is left has no text a parser skips, so every
// "<name" and every "name=" anywhere in the file -- comments included, which is
// why a comment can be allowed: it hides nothing -- is held to an allowlist; a
// candidate in text a parser would read as data only refuses more. Prefixed
// names are in no allowlist but xml:space and xmlns:xlink, whose value is
// pinned, and xmlns must name the document's own namespace, so nothing from
// XHTML gets in.
//
// The SVG allowlist is what design tools export (2026-10-19, widened after a
// review found Figma, Illustrator, Inkscape and SVGO output refused): shapes,
// text, gradients, clip paths, masks, patterns, and every filter primitive
// but feImage, which fetches. Every attribute added takes no URL, or only a
// url(), which may name only this file. Still refused: use, image, feImage,
// foreignObject, a, script, style (CSS fetches through @import and image-set()
// without writing url()), and every xlink:href.
const SVG_DOCUMENT = {
  label: "SVG artwork",
  root: "svg",
  namespace: "http://www.w3.org/2000/svg",
  comments: true,
  // The public SVG 1.1 and 1.0 doctypes, as Illustrator and potrace write
  // them, and no other: never one with an internal subset.
  doctypes: [
    /^<!DOCTYPE[\t\n\r ]+svg[\t\n\r ]+PUBLIC[\t\n\r ]+"-\/\/W3C\/\/DTD SVG 1\.1\/\/EN"[\t\n\r ]+"http:\/\/www\.w3\.org\/Graphics\/SVG\/1\.1\/DTD\/svg11\.dtd"[\t\n\r ]*>/,
    /^<!DOCTYPE[\t\n\r ]+svg[\t\n\r ]+PUBLIC[\t\n\r ]+"-\/\/W3C\/\/DTD SVG 20010904\/\/EN"[\t\n\r ]+"http:\/\/www\.w3\.org\/TR\/2001\/REC-SVG-20010904\/DTD\/svg10\.dtd"[\t\n\r ]*>/,
  ],
  pinned: new Map([["xmlns:xlink", "http://www.w3.org/1999/xlink"], ["xmlns:svg", "http://www.w3.org/2000/svg"]]),
  remedy:
    "Illustrator: export with Styling set to Presentation Attributes. Inkscape: save as Optimized SVG, or Plain " +
    "SVG without its metadata. Figma: export an image fill as PNG instead.",
  elements: new Set([
    "svg", "g", "defs", "title", "desc", "metadata", "path", "rect", "circle", "ellipse", "line", "polyline",
    "polygon", "text", "tspan", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "filter",
    "feBlend", "feColorMatrix", "feComponentTransfer", "feFuncR", "feFuncG", "feFuncB", "feFuncA", "feComposite",
    "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood",
    "feGaussianBlur", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting",
    "feSpotLight", "feTile", "feTurbulence",
  ]),
  attributes: new Set([
    "xmlns", "xmlns:xlink", "xmlns:svg", "xml:space", "version", "viewBox", "preserveAspectRatio", "width", "height", "x", "y",
    "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "fx", "fy", "d", "points", "transform", "fill",
    "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity",
    "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit", "opacity", "font-family", "font-size",
    "font-weight", "font-style", "font-variant", "font-stretch", "letter-spacing", "word-spacing", "text-anchor",
    "text-decoration", "dominant-baseline", "alignment-baseline", "baseline-shift", "offset", "stop-color",
    "stop-opacity", "gradientUnits", "gradientTransform", "spreadMethod", "id", "class", "data-name", "role",
    "aria-label", "aria-labelledby", "aria-hidden", "display", "visibility", "overflow", "color",
    "shape-rendering", "text-rendering", "paint-order", "vector-effect", "enable-background", "clip-path",
    "clip-rule", "clipPathUnits", "mask", "maskUnits", "maskContentUnits", "patternUnits", "patternContentUnits",
    "patternTransform", "filter", "filterUnits", "primitiveUnits", "color-interpolation",
    "color-interpolation-filters", "flood-color", "flood-opacity", "lighting-color", "result", "in", "in2",
    "type", "values", "tableValues", "slope", "intercept", "amplitude", "exponent", "dx", "dy", "stdDeviation",
    "operator", "k1", "k2", "k3", "k4", "mode", "radius", "scale", "xChannelSelector", "yChannelSelector",
    "baseFrequency", "numOctaves", "seed", "stitchTiles", "order", "kernelMatrix", "divisor", "bias", "targetX",
    "targetY", "edgeMode", "preserveAlpha", "surfaceScale", "diffuseConstant", "specularConstant",
    "specularExponent", "azimuth", "elevation", "z", "pointsAtX", "pointsAtY", "pointsAtZ",
    "limitingConeAngle",
  ]),
};
const SITEMAP_DOCUMENT = {
  label: "sitemap",
  root: "urlset",
  namespace: "http://www.sitemaps.org/schemas/sitemap/0.9",
  elements: new Set(["urlset", "url", "loc", "lastmod", "changefreq", "priority"]),
  attributes: new Set(["xmlns"]),
};
const XML_NAME = /[^\t\n\r <>"'=/]*/.source;
// An Apple property list (an iTerm2 or Terminal.app colour scheme). The SVG
// reader would refuse one for the "=" in its base64 <data>, so a plist is held
// to less, and to enough: the exact declaration and Apple's public doctype, no
// other "<!" or "<?" (no internal subset, CDATA or stylesheet), no xmlns, no
// character reference, and only plist element names. With no namespace and no
// stylesheet, a browser that opened one as XML would build a bare tree with
// nothing to run or load, whatever its attributes say.
const PLIST_ELEMENTS = new Set(["plist", "dict", "key", "string", "real", "integer", "data", "true", "false", "array", "date"]);
const PLIST_DOCTYPE = '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">';
const checkPropertyList = (file, bytes) => {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${file} is not UTF-8; save the property list as UTF-8.`);
  }
  const problems = new Set();
  const declaration = text.match(/^<\?xml version="1\.0" encoding="UTF-8"\?>/)?.[0];
  if (!declaration) problems.add('no <?xml version="1.0" encoding="UTF-8"?> first');
  const body = text.slice(declaration?.length ?? 0);
  for (const match of body.matchAll(/<[!?]/g)) {
    if (match[0] === "<!" && body.startsWith(PLIST_DOCTYPE, match.index)) continue;
    problems.add(`"${match[0]}" other than Apple's plist doctype`);
  }
  if (/xmlns/i.test(body)) problems.add("xmlns");
  if (/&(?!(?:amp|lt|gt|quot|apos);)/.test(body)) problems.add("a character reference");
  for (const match of body.matchAll(new RegExp(`<(?![!?])/?(${XML_NAME})`, "g"))) {
    if (!PLIST_ELEMENTS.has(match[1])) problems.add(`<${match[1]}>`);
  }
  if (problems.size) {
    fail(
      `${file} is read as an Apple property list and holds ${[...problems].join(", ")}. A plist may hold only ` +
        "plist elements, under the exact declaration and Apple's doctype, so that no reading of it builds a page.",
    );
  }
};
const checkXmlDocument = (file, bytes, allowed) => {
  let text;
  try {
    // A leading UTF-8 byte-order mark is dropped, as a browser drops it.
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${file} is not UTF-8. A browser decodes it by its own rules, which verify does not follow; save it as UTF-8.`);
  }
  // The declaration as tools write it, quotes and case varying, and nothing
  // else: another encoding is refused below as "<?".
  const declaration = text.match(
    /^<\?xml[\t\n\r ]+version=(["'])1\.0\1(?:[\t\n\r ]+encoding=(["'])[Uu][Tt][Ff]-8\2)?(?:[\t\n\r ]+standalone=(["'])(?:yes|no)\3)?[\t\n\r ]*\?>/,
  )?.[0] ?? "";
  const body = text.slice(declaration.length);
  const lineOf = (index) => text.slice(0, declaration.length + index).split("\n").length;
  // Every refusal in the file is listed at once, each construct the first time
  // it appears, so one run tells a contributor everything to change.
  const problems = new Map();
  const refuse = (index, what, why) => {
    if (!problems.has(what)) problems.set(what, `${file}:${lineOf(index)} has ${what}${why}`);
  };
  const rootAt = body.search(new RegExp(`<${allowed.root}[\t\n\r >/]`));
  for (const match of body.matchAll(/<[!?]|&(?!(?:amp|lt|gt|quot|apos);)/g)) {
    if (match[0] === "<!" && allowed.comments && body.startsWith("<!--", match.index)) continue;
    if (match[0] === "<!" && (allowed.doctypes ?? []).some((doctype) => doctype.test(body.slice(match.index)))) continue;
    refuse(
      match.index, `"${match[0]}"`,
      `. A doctype, CDATA section, processing instruction or character reference can make a browser build ` +
        `markup verify did not read; remove it (the only declaration allowed is <?xml version="1.0" ` +
        `encoding="UTF-8"?>, first, quoted either way${allowed.doctypes ? ", and the plain SVG 1.1 doctype" : ""}).`,
    );
  }
  // Chromium fetches a paint server in another file, fill="url(https://...)",
  // so a url() may only point into this one. CSS reads an escape in a function
  // name ("\75rl(") and ignores its case, so no backslash is allowed at all.
  for (const match of body.matchAll(/\\|url\((?!#[^)\t\n\r "'\\]*\))/gi)) {
    refuse(
      match.index, `"${match[0]}"`,
      `. A url() may only name an element in this file, as url(#id); one naming another file is a request a ` +
        `browser makes when it opens this one.`,
    );
  }
  for (const match of body.matchAll(new RegExp(`</?(${XML_NAME})`, "g"))) {
    // A comment or doctype passed the check above.
    if (match[1].startsWith("!")) continue;
    if (!allowed.elements.has(match[1])) {
      refuse(
        match.index, `the element <${match[1]}>`,
        `, which is not in the ${allowed.label} allowlist in scripts/verify.mjs. A browser opens this file as a ` +
          `document, so an element that links, runs script or embeds is a page verify does not read; add a new ` +
          `element deliberately.`,
      );
    }
  }
  for (const match of body.matchAll(new RegExp(`(${XML_NAME})[\t\n\r ]*=`, "g"))) {
    if (!allowed.attributes.has(match[1])) {
      refuse(
        match.index, `the attribute ${match[1]}=`,
        `, which is not in the ${allowed.label} allowlist in scripts/verify.mjs. Add a new attribute ` +
          `deliberately, never one that links, loads or runs script.`,
      );
    }
  }
  for (const match of body.matchAll(/(xmlns(?::[^\t\n\r <>"'=/]+)?)[\t\n\r ]*=[\t\n\r ]*(?:"([^"]*)"|'([^']*)'|())/g)) {
    const value = match[2] ?? match[3] ?? "";
    const expected = match[1] === "xmlns" ? allowed.namespace : allowed.pinned?.get(match[1]);
    if (expected !== undefined && value !== expected) {
      refuse(match.index, `${match[1]}=${JSON.stringify(value)}`, `; it must be ${expected}.`);
    }
  }
  // Without its namespace on the root, a browser builds elements that nothing
  // renders: harmless, but an SVG that silently stops drawing.
  // What may come before the root: comments and an allowed doctype, both
  // already read above.
  const prolog = body.slice(0, Math.max(rootAt, 0)).replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>]*>/, "").trim();
  if (rootAt === -1 || prolog !== "" ||
      !new RegExp(`^<${allowed.root}[\\t\\n\\r ][^<>]*xmlns[\\t\\n\\r ]*=`).test(body.slice(rootAt))) {
    problems.set("root", `${file} must open with <${allowed.root} xmlns="${allowed.namespace}">, its root element in its own namespace.`);
  }
  if (problems.size) {
    fail([...problems.values()].join("\n") + (allowed.remedy ? `\n${allowed.remedy}` : ""));
  }
  return body;
};
// The site's look (scripts/site-style.mjs, run at the end) names the one stylesheet served here.
const siteStyle = await import("./site-style.mjs");
for (const file of servedFiles) {
  const name = file.slice(file.lastIndexOf("/") + 1);
  const type = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  // An image's extension may be written in capitals (IMG_0001.JPG); a page's
  // or a note's may not, because .HTML and .MD are what this check refuses.
  // The one served stylesheet is the site's shared one (#72): scripts/site-style.mjs, run at the
  // end, reads every request it makes, which is only its own @font-face files (no @import, no other
  // url(), and no backslash to spell one), so a page that links it makes no request verify does
  // not read. Opened directly, Pages serves it as text/css, which a browser shows as text.
  const siteStylesheet = file === siteStyle.STYLESHEET;
  const reading = siteStylesheet ? "site stylesheet" : SERVED_TYPES.get(type) ??
    (SERVED_TYPES.get(type.toLowerCase()) === "inert" ? "inert" : undefined);
  if (type.toLowerCase() === "css" && !siteStylesheet) {
    fail(
      `${file} is a stylesheet. A page here may load one, and CSS makes requests (@import, url()) verify does ` +
        `not read; keep styles in the page's own <style>.`,
    );
  }
  if (!reading) {
    fail(
      `${file} sits where GitHub Pages serves files, and verify does not read a .${type} file. A page must be .html and a ` +
        `note .md -- Jekyll renders .markdown, .mkd, .mkdn, .mkdown and .MD as pages too, and a browser opens ` +
        `.htm, .xhtml and .xht as pages. Rename it, or add the type to SERVED_TYPES deliberately, once you know ` +
        `both how a browser opens it and whether a page here can load it (as a stylesheet, image, media or script).`,
    );
  }
  // A service worker controls every URL under the directory of its script, and
  // keeps serving them after the script and the line that registered it are
  // gone. Pages sends no Service-Worker-Allowed header to widen that.
  if (type === "mjs") {
    const scope = file.slice(0, file.lastIndexOf("/") + 1);
    const pages = servedFiles.filter((other) => other.endsWith(".html") && other.startsWith(scope));
    const page = pages.find((other) => !other.slice(scope.length).includes("/")) ?? pages[0];
    if (page) {
      fail(
        `${file} is a script in a directory at or above ${page}. Registered as a service worker, it would serve ` +
          `that page from text verify never reads, and keep doing so after it is removed. Move it under scripts/.`,
      );
    }
  }
  const bytes = await readFile(fileUrl(file));
  if (reading !== "note" && /^(\uFEFF)?---/.test(bytes.toString("utf8", 0, 8))) {
    fail(
      `${file} opens with "---". Jekyll runs any file with front matter through Liquid, so the file Pages ` +
        `serves is not the one verify read. Remove the front matter.`,
    );
  }
  if (reading === "svg") checkXmlDocument(file, bytes, SVG_DOCUMENT);
  if (reading === "plist") checkPropertyList(file, bytes);
  if (reading === "sitemap") {
    const body = checkXmlDocument(file, bytes, SITEMAP_DOCUMENT);
    const locations = [...body.matchAll(/<loc>([^<]*)<\/loc>/g)];
    if (locations.length !== (body.match(/<loc\b/g) ?? []).length) {
      fail(`${file} has a <loc> verify cannot read; write each as <loc>https://${cname}/...</loc>.`);
    }
    for (const [, location] of locations) {
      if (!location.startsWith(`https://${cname}/`) || new URL(location).href !== location) {
        fail(`${file} lists ${location}; a sitemap lists pages on https://${cname}/, written as a browser writes them.`);
      }
    }
  }
}

await themePageFreshness("sitemap.xml", themePages.get("sitemap.xml"));

// A changed package needs a new version. Claude Code keeps an installed plugin
// in a cache directory named for its version, and `claude plugin update`
// compares versions only. Read back 2026-10-19 against Claude Code 2.1.303,
// installing from a git-hosted copy of this marketplace: a skill changed under
// an unchanged version reached the marketplace clone and never the installed
// copy ("already at the latest version (1.0.0)"), and the same change under a
// bumped version installed at once. Nothing has slipped through yet: each theme
// pack's payload last changed in the commit that set its version, and
// berlin-studio-skills has never been on the default branch, so 1.0.0 is what
// it first ships. Each package's payload, the directory Claude Code loads
// themes or skills from, is held to the digest recorded beside the version
// that ships it, so a changed payload fails until its version moves. READMEs
// and previews are outside the payload; editing them needs no release. It runs
// last, so a change meets every check of its content before it is asked for a
// release.
const releasedPackages = [
  {
    name: "50-dark-themes", payload: "themes", version: "1.0.1",
    sha256: "c15494e9d30d86fd80ff19c3092140df312f32a81fae4bc8e7d1ecfcf2cad417",
  },
  {
    name: "dark-themes-vol-2", payload: "themes", version: "1.0.0",
    sha256: "2f38a03d9634f80174f62bfec9958dbbd5dadd7a08d75111bf33adb2c77216f2",
  },
  {
    name: "berlin-studio-skills", payload: "skills", version: "1.0.0",
    sha256: "5cec3aa5b65f2f6e6f93eb41216d548b5fbaa3a775e7dac920cd65d3c48af3bf",
  },
];
// Sorted paths and line-ending-normalised bytes, so a checkout that writes
// CRLF on another machine computes the same digest.
const payloadDigest = async (name, payload) => {
  const dir = `plugins/${name}/${payload}`;
  const paths = (await walkPackage(fileUrl(`${dir}/`), dir)).sort();
  const digest = createHash("sha256");
  for (const path of paths) {
    const bytes = (await readFile(fileUrl(path))).toString("latin1").replace(/\r\n?/g, "\n");
    const fileDigest = createHash("sha256").update(bytes, "latin1").digest("hex");
    digest.update(`${path.slice(dir.length + 1)}\u0000${fileDigest}\n`);
  }
  return digest.digest("hex");
};
// What else moves with a plugin's version, for the release message. A plugin
// with no release links on the site needs no entry.
const releaseFollowUp = {
  "50-dark-themes":
    "; verify then holds the storefront's softwareVersion and every release link to the new version, " +
    "and the GitHub release those links name must exist",
  "dark-themes-vol-2": "; verify then holds every Vol. 2 release link to the new version",
  "berlin-studio-skills": "",
};
if (JSON.stringify(releasedPackages.map((entry) => entry.name).sort()) !==
    JSON.stringify(expectedPlugins.map((plugin) => plugin.name).sort())) {
  fail("releasedPackages in scripts/verify.mjs must name exactly the plugins in expectedPlugins.");
}
// A version only moves forward. Claude Code keeps every version it installed in
// a cache directory named for it, and moving back to one reuses that directory:
// reproduced 2026-10-24 with Claude Code 2.1.310, a changed theme under a
// version moved back from 1.0.1 to 1.0.0 "updated" an installed pack to its old
// 1.0.0 files, with verify green. So a version is MAJOR.MINOR.PATCH, and the one
// a plugin ships may differ from the recorded one only by being newer.
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const isNewerVersion = (candidate, recorded) => {
  const [a, b] = [candidate, recorded].map((value) => SEMVER.exec(value).slice(1).map(Number));
  const at = a.findIndex((part, index) => part !== b[index]);
  return at !== -1 && a[at] > b[at];
};
for (const { name, payload, version, sha256 } of releasedPackages) {
  const shipping = marketplace.plugins.find((entry) => entry.name === name)?.version;
  const actual = await payloadDigest(name, payload);
  if (!SEMVER.test(String(shipping)) || !SEMVER.test(version)) {
    fail(
      `${name} ships version ${shipping} and releasedPackages records ${version}; each must be written ` +
        "MAJOR.MINOR.PATCH, such as 1.0.2, so verify can tell which is newer.",
    );
  }
  if (shipping !== version && !isNewerVersion(shipping, version)) {
    fail(
      `${name} ships version ${shipping}, which is not newer than ${version}, the version releasedPackages ` +
        `in scripts/verify.mjs records. A version only moves forward: Claude Code keeps every version it ` +
        `installed in a directory named for it, so a payload shipped under an older or reused version ` +
        `never reaches anyone who had it. Ship a version newer than ${version}.`,
    );
  }
  if (shipping !== version) {
    fail(
      `${name} ships version ${shipping}, but releasedPackages in scripts/verify.mjs records ${version}. ` +
        `If ${shipping} is the release you mean, record { version: "${shipping}", sha256: "${actual}" } ` +
        `for ${name} there.`,
    );
  }
  if (actual !== sha256) {
    fail(
      `plugins/${name}/${payload}/ changed since ${name} ${version} (its digest is now ${actual}). ` +
        `Claude Code updates an installed plugin only when its version moves forward. If ${name} ` +
        `${version} has never been released (it is not in the marketplace on the default branch; you may ` +
        `have just moved to it), record this digest under ${version}. Otherwise this change would never ` +
        `reach anyone who already has ${name} ${version}: bump the version in ` +
        `plugins/${name}/.claude-plugin/plugin.json and in its .claude-plugin/marketplace.json entry, ` +
        `then record { version: "<the new version>", sha256: "${actual}" } for ${name} in ` +
        `releasedPackages in scripts/verify.mjs${releaseFollowUp[name] ?? ""}.`,
    );
  }
}
// ---------------------------------------------------------------------------
// The site's look: assets/site.css holds the Familiars page's palette, both themes, contrast
// that holds in each, and motion that runs only when the visitor allows it; the pages on it link
// it first, carry the lights and the theme switch, and serve their own fonts under the OFL. The
// rules and their messages live in scripts/site-style.mjs. They run last: the guards above name
// what they find more precisely, and the first failure is the one reported.
// ---------------------------------------------------------------------------
const siteCss = await readFile(new URL(siteStyle.STYLESHEET, root), "utf8");
for (const problem of siteStyle.stylesheetProblems(siteCss)) fail(problem);
const siteFontFiles = Object.fromEntries(
  await Promise.all(
    (await readdir(new URL("assets/fonts/", root))).map(async (name) => [name, name.endsWith(".txt") ? await readFile(new URL(`assets/fonts/${name}`, root), "utf8") : true]),
  ),
);
const pageFonts = (await Promise.all(htmlFiles.map(async (path) => siteStyle.pageFontFiles(await readFile(new URL(path, root), "utf8"), path)))).flat();
for (const problem of siteStyle.fontProblems(siteCss, siteFontFiles, pageFonts)) fail(problem);
const siteFonts = siteStyle.fontFaces(siteCss).flatMap(({ urls }) => urls);
const siteTokens = siteStyle.sharedTokens(siteCss);
for (const path of siteStyle.SITE_PAGES) {
  for (const problem of siteStyle.pageProblems(await readFile(new URL(path, root), "utf8"), path, siteFonts, siteTokens)) fail(problem);
}

console.log(
  `Verified ${files.length} themes, ${pluginFiles.length} plugin themes, ${vol2Files.length} Vol. 2 themes, ` +
    `${galleryThemes.length} gallery cards, ` +
    `${verifiedGumroadSlugs.size} Gumroad products (prices checked against the recorded page, NOT against Gumroad), ` +
    `${verifiedPayPalIds.length} PayPal links, ${sourceSkills.length} skills, ` +
    `the stated ${roleAwareComparisonCount}-check claims, and the safe install command.`,
);
