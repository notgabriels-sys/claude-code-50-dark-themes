import { readdir, readFile } from "node:fs/promises";

import {
  buildThemeIndex,
  isThemeFile,
  serializeThemeIndex,
  serializeThemeItemList,
} from "./build-theme-index.mjs";

const root = new URL("../", import.meta.url);
const pluginRoot = new URL("../plugins/50-dark-themes/", import.meta.url);
const pluginThemesRoot = new URL("../plugins/50-dark-themes/themes/", import.meta.url);
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
  "slhbym",
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
// The third asserts NOTHING about Gumroad. No Gumroad product's price has ever
// been read back by anyone working in this repo -- see CLAUDE.md, "Gumroad --
// the unverified half of the shop". A price that was already wrong on the day
// it was recorded is copied faithfully into this table and the build stays
// green forever.
//
// What it does buy is drift detection: a price cannot be edited on the page,
// in any of the three places the page now states it, without the edit being
// deliberate. That catches a stray keystroke or a bad merge, which is worth
// having. It is not verification and must never be described as verification.
//
// price null means the product states no price: `slhbym` is the name-your-price
// zip. `wuhehk` is the bundle, whose price is inline copy rather than a price
// element, so it is recorded here like any other.
//
// Two rows are in USD on an otherwise-EUR page (`cfcvmy` $19, `xcxeb` $9, and
// the bundle at $39). That inconsistency is recorded on purpose rather than
// smoothed over. Do NOT resolve it by editing index.html; it is resolved by
// reading the real products in a signed-in browser.
const recordedGumroadPrices = [
  { slug: "slhbym", price: null },
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
    imageData = await readFile(new URL(imagePath, root));
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
  await validateThemeFile(file, new URL(file, root));
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
  const source = await readFile(new URL(file, root), "utf8");
  const packaged = await readFile(new URL(file, pluginThemesRoot), "utf8");
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
const vol2Previews = JSON.parse(await readFile(new URL("previews.json", vol2Root), "utf8"));
const vol2ThemesByName = new Map();
for (const file of vol2Files) {
  const theme = await validateThemeFile(`dark-themes-vol-2/${file}`, new URL(file, vol2ThemesRoot));
  const preview = vol2Previews[theme.name];
  if (typeof preview !== "string" || !/^#[0-9a-f]{6}$/i.test(preview)) {
    fail(`Vol. 2 theme ${theme.name} needs a six-digit hex preview terminal colour in previews.json.`);
  }
  vol2ThemesByName.set(theme.name, theme);
}

const marketplace = JSON.parse(await readFile(new URL(".claude-plugin/marketplace.json", root), "utf8"));
const pluginManifest = JSON.parse(await readFile(new URL(".claude-plugin/plugin.json", pluginRoot), "utf8"));
const vol2Manifest = JSON.parse(await readFile(new URL(".claude-plugin/plugin.json", vol2Root), "utf8"));
if (marketplace.name !== "notgabriels-themes") fail("Unexpected marketplace name.");
const expectedPlugins = [
  { name: "50-dark-themes", source: "./plugins/50-dark-themes" },
  { name: "dark-themes-vol-2", source: "./plugins/dark-themes-vol-2" },
  { name: "berlin-studio-skills", source: "./plugins/berlin-studio-skills" },
];
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

// The five skills live in .claude/skills/ (source of truth) and are mirrored
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
for (const name of sourceSkills) {
  const original = await readFile(new URL(`${name}/SKILL.md`, sourceSkillDir), "utf8");
  const packaged = await readFile(new URL(`${name}/SKILL.md`, packagedSkillDir), "utf8");
  if (original !== packaged) {
    fail(`Skill ${name} differs from its plugin copy. Run node scripts/sync-plugin-skills.mjs.`);
  }
  if (!/^---\r?\n[\s\S]*?\bname:\s*\S/m.test(original)) {
    fail(`Skill ${name} is missing YAML frontmatter with a name.`);
  }
  if (!/^description:/m.test(original)) {
    fail(`Skill ${name} is missing a description in its frontmatter.`);
  }
}

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
  [/<span class="sr-only" id="copyStatus" aria-live="polite"><\/span>/, "copy-status live region"],
  [/<meta property="og:image:alt" content="[^"]+">/, "Open Graph image alternative"],
  [/<meta name="twitter:image:alt" content="[^"]+">/, "X image alternative"],
];
const missingStorefrontContracts = storefrontContracts
  .filter(([pattern]) => !pattern.test(html))
  .map(([, label]) => label);
if (missingStorefrontContracts.length) {
  fail(`Storefront accessibility contract is missing: ${missingStorefrontContracts.join(", ")}.`);
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
  const code = blankComments(await readFile(new URL(`scripts/${name}`, root), "utf8"));
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
  const source = await readFile(new URL(file, root), "utf8");
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
// another links two and says "from €6", and the free zip's row says "$0 is
// fine". Demanding one exact price per line would fail on honest copy. So every
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
  const card = html.match(
    new RegExp(`<a[^>]*href="${href}"[^>]*>([\\s\\S]*?)</a>`),
  );
  if (!card) {
    fail(`Could not read the card wrapping PayPal link ${id}.`);
    continue;
  }
  // Every currency amount inside the card must be the verified one, rather than
  // one exact price element. Main restyled these cards to "View checkout · EUR45"
  // on 2026-08-24; a check pinned to `<i>EUR45</i>` would have gone red for a
  // wording change while still passing a card that showed a second, wrong number
  // somewhere else in the same anchor. This fails on the number, not the markup.
  const stated = statedAmounts(card[1]);
  if (stated.length === 0) {
    fail(`PayPal link ${id} must charge ${price}; its card states no price at all.`);
  }
  for (const amount of stated) {
    if (amount !== price) {
      fail(
        `PayPal link ${id} must charge ${price} per the verified rate card; ` +
          `its card on the page states ${amount}.`,
      );
    }
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
      source: await readFile(new URL(file, root), "utf8"),
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
  const source = file === "index.html" ? html : await readFile(new URL(file, root), "utf8");
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
  // them, but no intervening text.
  const claims = [...source.matchAll(/(\d[\d,]*)\s*(?:<\/?[a-z][^>]*>\s*)*role-aware/gi)];
  if (!claims.length) {
    fail(`${page} states no role-aware check count; the claim guard would be inert.`);
  }
  for (const [, stated] of claims) {
    const value = Number.parseInt(stated.replace(/,/g, ""), 10);
    if (value !== roleAwareComparisonCount) {
      fail(
        `${page} claims ${value} role-aware checks; the verifier runs ${roleAwareComparisonCount}.`,
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
  const source = await readFile(new URL(file, root), "utf8");
  if (!/\.hidden\s*=/.test(source)) continue;
  if (!/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(source)) {
    fail(
      `${file} toggles the hidden property but never overrides it in CSS; ` +
        "an author display rule would leave hidden elements on screen. " +
        "Add [hidden]{display:none!important}.",
    );
  }
}

// One image, one description. preview.png is shared by every public page; it
// was described three different ways, two of them as "a gallery preview" of a
// card that has never been a gallery. Alt text drifts silently because nobody
// sees it — so pages that share an image must state the same alt, and a page
// that ships an og:image without alt text fails.
const sharedImageAlts = new Map();
for (const file of publicHtmlFiles) {
  const source = await readFile(new URL(file, root), "utf8");
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

console.log(
  `Verified ${files.length} themes, ${pluginFiles.length} plugin themes, ${vol2Files.length} Vol. 2 themes, ` +
    `${galleryThemes.length} gallery cards, ` +
    `${verifiedGumroadSlugs.size} Gumroad products (prices checked against the recorded page, NOT against Gumroad), ` +
    `${verifiedPayPalIds.length} PayPal links, ${sourceSkills.length} skills, ` +
    `the stated ${roleAwareComparisonCount}-check claims, and the safe install command.`,
);
