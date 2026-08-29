import { readdir, readFile } from "node:fs/promises";

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
const verifiedPayPalIds = [
  "3SWZ64EXW9C8W",
  "6Z93DNS76PCGS",
  "QW8V53WWM2P7E",
];
// Buyer-side read-back on 2026-08-24 and 2026-08-25 confirmed these product pages return a
// published Gumroad product. A plausible URL or HTTP 200 is not enough:
// unpublished Gumroad products can still render a 200-status product shell.
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

const files = (await readdir(root))
  .filter((file) => file.endsWith(".json"))
  .sort();

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
if (marketplace.plugins?.length !== 2) fail("The marketplace must expose exactly two plugins.");
if (marketplace.plugins[0].name !== "50-dark-themes") fail("Unexpected marketplace plugin name.");
if (marketplace.plugins[0].source !== "./plugins/50-dark-themes") fail("Unexpected plugin source path.");
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

  const gumroadLink = productHtml.match(/https:\/\/notgabriel\.gumroad\.com\/l\/([a-z0-9-]+)/);
  if (!gumroadLink) {
    fail("Every curated developer pick must link to its verified Gumroad product page.");
  }
  const slug = gumroadLink[1];
  const trackedCheckout = productHtml.match(
    /href="(https:\/\/notgabriel\.gumroad\.com\/l\/[a-z0-9-]+\?[^\"]+)"/,
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
for (const file of publicHtmlFiles) {
  const source = await readFile(new URL(file, root), "utf8");
  if (!source.includes('rel="icon" type="image/svg+xml" href="favicon.svg"')) {
    fail(`${file} must expose the first-party SVG favicon.`);
  }
  for (const match of source.matchAll(/https:\/\/notgabriel\.gumroad\.com\/l\/([a-z0-9-]+)/g)) {
    const slug = match[1];
    if (!verifiedGumroadSlugs.has(slug)) {
      fail(`${file} contains an unverified or unavailable Gumroad product link: ${slug}.`);
    }
  }
}
for (const match of readme.matchAll(/https:\/\/notgabriel\.gumroad\.com\/l\/([a-z0-9-]+)/g)) {
  const slug = match[1];
  if (!verifiedGumroadSlugs.has(slug)) {
    fail(`README.md contains an unverified or unavailable Gumroad product link: ${slug}.`);
  }
}
for (const id of verifiedPayPalIds) {
  if (!html.includes(`https://www.paypal.com/ncp/payment/${id}`)) {
    fail(`Verified PayPal link ${id} is missing.`);
  }
}

await import("./verify-contrast.mjs");

console.log(
  `Verified ${files.length} themes, ${pluginFiles.length} plugin themes, ${vol2Files.length} Vol. 2 themes, ` +
    `${galleryThemes.length} gallery cards, ` +
    `${verifiedGumroadSlugs.size} Gumroad products, ${verifiedPayPalIds.length} PayPal links, and the safe install command.`,
);
