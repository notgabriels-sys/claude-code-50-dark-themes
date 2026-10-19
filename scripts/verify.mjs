import { readdir, readFile, stat } from "node:fs/promises";
import { createContext, Script } from "node:vm";

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
// The storefront's flagship gallery covers these 50. Vol. 2 names, validated
// below, join the same uniqueness set and have their own storefront section,
// checked against VOL2_THEMES further down.
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
// previews.json must hold exactly the packaged themes, as CONTRIBUTING says.
// The loop above only looks entries up, so a theme renamed or removed left its
// old key behind and nothing noticed.
for (const name of Object.keys(vol2Previews)) {
  if (!vol2ThemesByName.has(name)) fail(`Vol. 2 previews.json has an entry for ${name}, which no packaged theme uses.`);
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
// The free Gumroad ZIP of the themes was withdrawn as unverified (#53), along
// with its slug above. A sentence offering it with no link slips past the link
// check: the install guide's FAQ structured data still said "The Gumroad ZIP can
// be downloaded for zero by choosing the free price." No page may offer it.
for (const file of [...publicHtmlFiles, "README.md", "llms.txt"]) {
  const text = (await readFile(new URL(file, root), "utf8")).replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  const offer = text.match(
    /gumroad[^.]{0,80}(?:for zero|free price|\$0|name your price|free download)|(?:for zero|free price|\$0|name your price|free download)[^.]{0,80}gumroad/i,
  );
  if (offer) {
    fail(`${file} still offers the withdrawn free Gumroad download ("${offer[0]}"). Point to the GitHub release instead.`);
  }
  // The terminal app owns its background; README and both articles say so, and
  // tell the reader to set it. The storefront card for the paid Agensi setup
  // assistant said the skill "sets your terminal background", though its own
  // listing says it tells you the hex to set and changes no terminal config
  // unless asked. Telling the reader to set it ("Set your terminal background")
  // stays legal; saying a theme, plugin or skill sets it does not.
  const setsBackground = text.match(/\b(?:sets|changes|configures)\s+(?:your|the)\s+terminal(?:'s|’s)?\s+(?:application'?s?\s+)?background/i);
  if (setsBackground) {
    fail(`${file} claims a tool "${setsBackground[0]}". Only the terminal app sets its background; say what to set it to instead.`);
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

const { roleAwareComparisonCount, indicatorTextBelowAA, indicatorTextFloor } = await import("./verify-contrast.mjs");

// ---------------------------------------------------------------------------
// Stated numbers are public claims. The share card once printed "726
// role-aware checks" after the real figure had become 894 — caught on a branch,
// but only because someone happened to look; nothing tied the printed number to
// the computed one. Checked here: the role-aware count on the storefront and the
// share card, the share card's "<50> + <12> themes", and the storefront's Vol. 2
// heading. The flagship's "50" is also the product's name throughout; it stays
// true because the theme-file check above pins the flagship at exactly fifty.
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

// The storefront's Vol. 2 heading states that pack's size in words, and it is
// the storefront's only statement of it. A dozen or so other files — README,
// both articles, llms.txt, the plugin descriptions and README, the planning
// docs — give the same size in free prose, which no pattern here reads
// reliably; CONTRIBUTING's add-a-theme step gives the search that finds them.
const numberWords = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const vol2Heading = html.match(/Vol\.(?:&nbsp;|\s)2\s*—\s*([a-z]+|\d+)\s+new atmospheres/i);
if (!vol2Heading) {
  fail("index.html states no Vol. 2 pack size in its heading; the count guard would be inert.");
}
const vol2Stated = /^\d+$/.test(vol2Heading[1]) ? Number(vol2Heading[1]) : numberWords.indexOf(vol2Heading[1].toLowerCase());
if (vol2Stated !== vol2Files.length) {
  fail(`index.html's Vol. 2 heading says "${vol2Heading[1]}" new atmospheres; the pack ships ${vol2Files.length}.`);
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

// README promises AA for foreground accents and calls `permission` and
// `planMode` the second accent, but verify-contrast.mjs holds both to the 3:1
// non-text floor, and Claude Code draws text in them ("⏸ plan mode on", plan
// titles, dialog titles). While that floor is below 4.5, README has to say so,
// with the number of themes that keep that text below AA and the lowest ratio,
// both as verify-contrast.mjs computes them. The claim is read from whichever
// paragraph names both tokens with the non-text floor and states a count, so
// another paragraph mentioning the floor does not get checked in its place.
const indicatorCountClaim = /\b([a-z]+|\d+) of the (\d+) themes\b/i;
const indicatorParagraphs = readme
  .split(/\n\s*\n/)
  .map((paragraph) => paragraph.replace(/\s+/g, " "))
  .filter((paragraph) => /non-text floor/i.test(paragraph) && paragraph.includes("`permission`") && paragraph.includes("`planMode`"));
const indicatorClaim = indicatorParagraphs.find((paragraph) => indicatorCountClaim.test(paragraph));
const themeTotal = files.length + vol2Files.length;
if (indicatorTextFloor >= 4.5) {
  if (indicatorParagraphs.length) {
    fail(`README.md still says \`permission\` and \`planMode\` are held to the non-text floor; verify-contrast.mjs holds them at ${indicatorTextFloor}:1.`);
  }
} else if (!indicatorParagraphs.length) {
  fail("README.md's contrast-floor paragraph must say that `permission` and `planMode` are held to the non-text floor.");
} else if (indicatorTextBelowAA.length) {
  const lowest = indicatorTextBelowAA[0];
  const stated = indicatorClaim?.match(indicatorCountClaim);
  const statedCount = stated && (/^\d+$/.test(stated[1]) ? Number(stated[1]) : numberWords.indexOf(stated[1].toLowerCase()));
  if (!stated || statedCount !== indicatorTextBelowAA.length || Number(stated[2]) !== themeTotal) {
    fail(
      `README.md must say that ${indicatorTextBelowAA.length} of the ${themeTotal} themes keep ` +
        `\`permission\`/\`planMode\` text below AA${stated ? `; it says "${stated[0]}"` : ""}.`,
    );
  }
  if (!indicatorClaim.includes(`${lowest.ratio.toFixed(2)}:1 in ${lowest.name}`)) {
    fail(`README.md must give the lowest \`permission\`/\`planMode\` ratio: ${lowest.ratio.toFixed(2)}:1 in ${lowest.name}.`);
  }
} else if (indicatorParagraphs.some((paragraph) => indicatorCountClaim.test(paragraph) || /\d\.\d\d:1|below (?:AA|4\.5:1)/i.test(paragraph))) {
  fail("README.md says some `permission`/`planMode` text is below AA, but every theme now holds it at 4.5:1.");
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

// The themes, the plugins and the installer are MIT, but the repository is not:
// every product folder ships its own licence, and those forbid resale or
// redistribution. The article's FAQ structured data said "The complete theme
// set and source repository are free under the MIT license" while its visible
// answer named only the MIT parts. Wherever a product licence is not MIT, no
// public page (structured data included) may call the repository MIT.
const productLicences = [];
for (const entry of await readdir(new URL("products/", root), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const licence = new URL(`products/${entry.name}/LICENSE.txt`, root);
  try {
    if (!/^\s*MIT License/.test(await readFile(licence, "utf8"))) productLicences.push(entry.name);
  } catch {}
}
if (productLicences.length) {
  for (const file of [...publicHtmlFiles, "README.md", "llms.txt", "plugins/50-dark-themes/README.md", "plugins/dark-themes-vol-2/README.md"]) {
    const text = (await readFile(new URL(file, root), "utf8")).replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
    const claim = text.match(/repositor(?:y|ies)\b[^.]{0,40}\bMIT\b|\bMIT\b[^.]{0,40}\brepositor(?:y|ies)\b/i);
    if (claim) {
      fail(
        `${file} says the repository is MIT ("${claim[0]}"), but products/${productLicences[0]} and ` +
          `${productLicences.length - 1} other product folder(s) carry their own non-MIT licences. Name the MIT parts instead.`,
      );
    }
  }
}

// CI runs on pull requests and on pushes to main only (verify.yml's push
// trigger is filtered to main). README and CONTRIBUTING said it ran "on every
// push"; this branch had dozens of pushes and not one push-triggered run. When
// the push trigger names branches, "every push" must say which.
const verifyWorkflow = await readFile(new URL(".github/workflows/verify.yml", root), "utf8");
if (/^\s*push:\s*\n\s*branches:/m.test(verifyWorkflow)) {
  for (const file of ["README.md", "CONTRIBUTING.md"]) {
    const text = (await readFile(new URL(file, root), "utf8")).replace(/\s+/g, " ");
    const claim = text.match(/every push(?! to)/i);
    if (claim) {
      fail(`${file} says CI runs on "${claim[0]}", but verify.yml runs only on pull requests and pushes to main.`);
    }
  }
}

// Plugin themes load when Claude Code starts. Checked live on 2.1.302: after
// `/plugin install` inside a running session ("Plugin is now active."), or
// `claude plugin install` from a shell while a session is open, /theme lists
// none of the pack until Claude Code restarts. So every page that hands out a
// plugin install command must say, close to the command, to restart.
// Tags are dropped rather than spaced, so a syntax-highlighted command
// (`<span>50</span>-dark-themes`) still reads as one.
for (const file of [
  "README.md",
  "llms.txt",
  "plugins/50-dark-themes/README.md",
  "plugins/dark-themes-vol-2/README.md",
  "index.html",
  "claude-code-theme-install-guide.html",
]) {
  let text = await readFile(new URL(file, root), "utf8");
  if (file.endsWith(".html")) {
    text = text
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;|&#160;/g, " ");
  }
  text = text.replace(/\s+/g, " ");
  const commands = [...text.matchAll(/plugin install [\w-]+@notgabriels-themes/g)];
  if (!commands.length) fail(`${file} no longer shows a plugin install command; update the restart check in verify.mjs.`);
  // Run alone on a fresh machine, the install fails: "Plugin not found in
  // marketplace". llms.txt gave only that line, for agents that run it verbatim.
  if (!text.includes("marketplace add notgabriels-sys/claude-code-50-dark-themes")) {
    fail(`${file} gives a plugin install command but not the marketplace add command it needs first.`);
  }
  for (const command of commands) {
    if (!/restart/i.test(text.slice(command.index, command.index + 700))) {
      fail(
        `${file} gives "${command[0]}" without saying to restart Claude Code if it was open. Plugin themes ` +
          "load when Claude Code starts, so a session open during the install lists none of them in /theme.",
      );
    }
  }
}

// The install guide's manual fallback is a procedure people follow verbatim on
// a page that search can land them on directly. It used to open with
// `cp *.json ~/.claude/themes/` and never say where the files come from — the
// page contained no clone, download, archive or curl step at all — so the copy
// silently depended on the reader already standing in a clone. It also copied
// only the root fifty, immediately after introducing Vol. 2 by name, leaving
// anyone without the plugin flow no manual route to the twelve.
const manualSection = installGuide.match(/<section[^>]*id="manual"[\s\S]*?<\/section>/);
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

// One image, one description. preview.png is shared by every public page that
// carries a share image (impressum.html carries none); it
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

// Claude Code's /theme takes no argument. Run live on 2.1.302 with the pack
// installed, `/theme deep-field` opened the same picker as `/theme`, left the
// current theme ticked and saved nothing. Every gallery card still copied
// `/theme <slug>` under 'Applied theme "<Name>"' — sixty-two buttons handing out
// a command that applies nothing. Copy the bare command; name the theme to pick.
if (/\/theme \$\{|["'`]\/theme [a-z0-9][a-z0-9-]*["'`]/.test(html)) {
  fail(
    "index.html copies a /theme command with a theme argument. Claude Code's /theme ignores " +
      "arguments, so it applies nothing. Copy /theme and name the theme to choose.",
  );
}
// Card checks read what the page renders, not one spelling of its source.
// Review rounds showed every regex over the template either missed a refactor
// (`${esc(themeSlug)}`, `${slug(name)}`) or rejected correct styling
// (`<span class="hex">`), and evaluating a slice of the script broke on CRLF
// line endings, helpers defined elsewhere and browser globals. So run the
// page's inline scripts in order, as the browser does, in a node:vm context
// against a stand-in DOM that records what they write, and take renderTheme,
// THEMES and VOL2_THEMES from them. Three rules keep that honest:
// - a script that runs too long, throws or rejects is reported, never hangs
//   or crashes the build;
// - #grid and #vol2Grid must hold exactly THEMES.map(renderTheme) and
//   VOL2_THEMES.map(renderTheme), so the cards checked are the cards shown;
// - every rendered card must still show its theme's name, so a DOM call the
//   stand-in does not model fails loudly instead of rendering blank cards
//   that pass.
const pageScriptTimeout = 2000;
// A real tree ends, and loops that walk it stop on null.
const treeWalks = new Set([
  "firstChild", "lastChild", "firstElementChild", "lastElementChild", "parentNode", "parentElement",
  "nextSibling", "previousSibling", "nextElementSibling", "previousElementSibling", "offsetParent",
]);
const standIn = (props = Object.create(null)) =>
  new Proxy(function () {}, {
    get(target, key) {
      if (Object.hasOwn(props, key)) return props[key];
      if (key === Symbol.iterator) return function* () {};
      if (key === Symbol.toPrimitive) return () => "";
      if (typeof key === "symbol" || key === "then") return undefined;
      if (treeWalks.has(key)) return null;
      return (props[key] = standIn());
    },
    set(target, key, value) {
      props[key] = value;
      return true;
    },
    apply: () => standIn(),
    construct: () => standIn(),
  });
const withProps = (props) => standIn(Object.assign(Object.create(null), props));
const pageElements = new Map();
const pageElement = (id) => {
  if (!pageElements.has(id)) {
    const props = Object.create(null);
    pageElements.set(id, { props, element: standIn(props) });
  }
  return pageElements.get(id).element;
};
// Enough of a new element for the usual escaping idioms: set textContent or
// append text (a string or a createTextNode()), then read innerHTML.
const escapeText = (text) =>
  text.replace(/[&<>\u00a0]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\u00a0": "&nbsp;" })[c]);
const textNodes = new WeakMap();
const createdTextNode = (value) => {
  const node = withProps({ nodeType: 3, data: String(value), textContent: String(value) });
  textNodes.set(node, String(value));
  return node;
};
const createdElement = () => {
  const props = Object.create(null);
  let text = "";
  let markup = "";
  const textOf = (item) =>
    typeof item === "string" || typeof item === "number" ? String(item) : textNodes.get(item) ?? "";
  const append = (...items) => {
    for (const item of items) {
      text += textOf(item);
      markup += escapeText(textOf(item));
    }
  };
  const textAccess = {
    get: () => text,
    set: (value) => {
      text = String(value);
      markup = escapeText(text);
    },
  };
  Object.defineProperties(props, {
    textContent: textAccess,
    innerText: textAccess,
    innerHTML: { get: () => markup, set: (value) => (markup = text = String(value)) },
  });
  Object.assign(props, {
    nodeType: 1,
    append,
    appendChild: (node) => (append(node), node),
    replaceChildren: (...items) => {
      text = markup = "";
      append(...items);
    },
    insertAdjacentText: (position, value) => {
      if (/^afterbegin$/i.test(position)) {
        text = String(value) + text;
        markup = escapeText(String(value)) + markup;
      } else if (/^beforeend$/i.test(position)) append(value);
    },
  });
  return standIn(props);
};
// DOMContentLoaded and load fire once the scripts have run.
const loadListeners = [];
const addEventListener = (type, listener) => {
  if (/^(?:DOMContentLoaded|load)$/.test(type)) loadListeners.push(listener);
};
const pageDocument = withProps({
  addEventListener,
  readyState: "loading",
  getElementById: (id) => pageElement(String(id)),
  querySelector: (selector) =>
    /^#[\w-]+$/.test(String(selector).trim()) ? pageElement(String(selector).trim().slice(1)) : standIn(),
  createElement: createdElement,
  createTextNode: createdTextNode,
});
const pageStorage = () =>
  withProps({ length: 0, getItem: () => null, key: () => null, setItem() {}, removeItem() {}, clear() {} });
const pageGlobals = {
  document: pageDocument,
  console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
  localStorage: pageStorage(),
  sessionStorage: pageStorage(),
  matchMedia: (query) => withProps({ matches: false, media: String(query) }),
  // Never settles, so code waiting on the network simply never resumes.
  fetch: () => new Promise(() => {}),
};
pageGlobals.window = pageGlobals.self = withProps({ ...pageGlobals, addEventListener });
for (const name of [
  "navigator", "location", "history", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "IntersectionObserver",
  "ResizeObserver", "MutationObserver", "Event", "CustomEvent", "HTMLElement", "Element", "Node", "performance",
  "alert", "scrollTo",
]) {
  pageGlobals[name] = standIn();
}
Object.assign(pageGlobals, { URL, URLSearchParams, TextEncoder, TextDecoder, atob, btoa });
const pageContext = createContext(pageGlobals, { microtaskMode: "afterEvaluate" });
let pageScriptError;
const runInPage = (source, filename = "index.html") => {
  try {
    return { value: new Script(source, { filename }).runInContext(pageContext, { timeout: pageScriptTimeout }) };
  } catch (error) {
    return { error };
  }
};
const recordPageRejection = (reason) => {
  pageScriptError ??= reason;
};
process.on("unhandledRejection", recordPageRejection);
// A browser runs no script inside a comment or a <template>.
const runnableMarkup = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<template\b[\s\S]*?<\/template\s*>/gi, "");
for (const [, attributes, source] of runnableMarkup.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
  const type = attributes.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1];
  if (/\bsrc\s*=/i.test(attributes) || (type && !/^(?:text|application)\/(?:java|ecma)script$/i.test(type))) continue;
  const { error } = runInPage(source);
  pageScriptError ??= error;
}
pageGlobals.__fireLoadListeners = () => {
  for (const listener of loadListeners.splice(0)) {
    try {
      if (typeof listener === "function") listener.call(pageDocument, withProps({ type: "load" }));
    } catch (error) {
      pageScriptError ??= error;
    }
  }
};
const listenerRun = runInPage("__fireLoadListeners()");
pageScriptError ??= listenerRun.error;
await new Promise((resolve) => setImmediate(resolve));
process.off("unhandledRejection", recordPageRejection);
const pageScriptNote = pageScriptError
  ? ` The page script failed first: ${pageScriptError?.message ?? pageScriptError}.`
  : "";
const bindings = runInPage("({ renderTheme, THEMES, VOL2_THEMES })");
if (bindings.error) {
  fail(
    `index.html's script did not define renderTheme, THEMES and VOL2_THEMES when verify.mjs ran it ` +
      `(${bindings.error.message}).${pageScriptNote} Update the card checks in verify.mjs.`,
  );
}
// Rendered inside the page, by the page's own .map(), so every argument it
// passes is the one the browser passes.
const rendered = runInPage("({ grid: THEMES.map(renderTheme), vol2Grid: VOL2_THEMES.map(renderTheme) })");
if (rendered.error) {
  fail(
    `renderTheme() could not render the gallery when verify.mjs ran it (${rendered.error.message}).` +
      `${pageScriptNote} Update the card checks.`,
  );
}
const squeeze = (markup) => String(markup).replace(/>\s+</g, "><").trim();
const renderedCards = [];
for (const [gridId, listName] of [["grid", "THEMES"], ["vol2Grid", "VOL2_THEMES"]]) {
  const rows = [...bindings.value[listName]];
  const cards = [...rendered.value[gridId]];
  const shown = pageElements.get(gridId)?.props.innerHTML;
  if (cards.some((card) => typeof card !== "string") || squeeze(cards.join("")) !== squeeze(shown ?? "")) {
    fail(
      `#${gridId} in index.html does not hold ${listName}.map(renderTheme), so verify.mjs cannot tell which ` +
        `cards the page shows.${pageScriptNote} Update the card checks to follow the new rendering.`,
    );
  }
  rows.forEach((row, index) => renderedCards.push({ row, markup: cards[index] }));
}

// Text as a reader gets it: comments, <style> and <script> removed, block
// boundaries as line breaks, other tags as spaces, character references
// decoded, and source whitespace collapsed as a browser collapses it: a
// newline in the HTML source counts as a line break only inside <pre> or
// <textarea>, where a browser keeps it. Attribute values
// are read separately, because a screen reader announces an aria-label and a
// share card shows a meta description.
const namedEntities = {
  nbsp: "\u00a0", thinsp: "\u2009", ensp: "\u2002", emsp: "\u2003", ldquo: "\u201c", rdquo: "\u201d",
  lsquo: "\u2018", rsquo: "\u2019", quot: '"', apos: "'", middot: "\u00b7", mdash: "\u2014", ndash: "\u2013",
  gt: ">", lt: "<",
};
const fromCodePoint = (code, reference) => (code <= 0x10ffff ? String.fromCodePoint(code) : reference);
const decodeEntities = (text) =>
  text
    .replace(/&#(\d+);?/g, (reference, code) => fromCodePoint(Number(code), reference))
    .replace(/&#x([0-9a-f]+);?/gi, (reference, code) => fromCodePoint(parseInt(code, 16), reference))
    .replace(/&([a-z]+);/gi, (reference, name) => namedEntities[name.toLowerCase()] ?? reference)
    .replace(/&amp;/gi, "&");
const withoutCode = (markup) =>
  markup.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, " ");
const anyTag = /<(\/?)([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const blockTag = new RegExp(
  "^(?:address|article|aside|blockquote|br|button|caption|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|" +
    "footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|table|tbody|td|tfoot|th|thead|tr|ul)$",
  "i",
);
const blockBreak = "\u0000";
const keepPreformatted = (markup) =>
  markup.replace(/<(pre|textarea)\b[\s\S]*?<\/\1\s*>/gi, (block) => block.replace(/\r\n?|\n/g, blockBreak));
const visibleText = (markup) =>
  decodeEntities(
    keepPreformatted(withoutCode(markup))
      .replace(anyTag, (tag, closing, name) => (blockTag.test(name) ? blockBreak : " "))
      .replace(/<![^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .replace(/ ?\u0000[\s\u0000]*/g, "\n");
const startTag = /<[a-z][a-z0-9-]*(?:\s+[^\s"'=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*\s*\/?>/gi;
const attributeValues = (markup) =>
  [...withoutCode(markup).matchAll(startTag)].flatMap(([tag]) =>
    [...tag.matchAll(/\s[^\s"'=/>]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)].map((attribute) =>
      decodeEntities(attribute[1] ?? attribute[2] ?? attribute[3]).replace(/\s+/g, " "),
    ),
  );
// The text of every element that displays a command: code, kbd, samp, pre,
// buttons, and anything whose class names a prompt or a command.
const voidTag = /^(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
const commandTexts = (markup) => {
  const source = keepPreformatted(withoutCode(markup));
  const open = [];
  const texts = [];
  for (const tag of source.matchAll(anyTag)) {
    const [whole, closing, name, attributes] = tag;
    if (closing) {
      const at = open.findLastIndex((entry) => entry.name === name.toLowerCase());
      if (at < 0) continue;
      for (const entry of open.splice(at)) {
        if (entry.command) texts.push(visibleText(source.slice(entry.from, tag.index)));
      }
    } else if (!voidTag.test(name) && !/\/\s*$/.test(attributes)) {
      const className = attributes.match(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
      const command =
        /^(?:button|code|kbd|pre|samp)$/i.test(name) ||
        /prompt|command/i.test(className?.[1] ?? className?.[2] ?? className?.[3] ?? "");
      open.push({ name: name.toLowerCase(), command, from: tag.index + whole.length });
    }
  }
  return texts;
};
const jsonLdStrings = [];
const collectStrings = (value) => {
  if (typeof value === "string") jsonLdStrings.push(value);
  else if (value && typeof value === "object") Object.values(value).forEach(collectStrings);
};
const jsonLdBlock = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
for (const [, body] of html.matchAll(jsonLdBlock)) {
  try {
    collectStrings(JSON.parse(body));
  } catch {
    jsonLdStrings.push(body);
  }
}

// A stand-in DOM that loses text renders blank cards that every check below
// would pass. Each card names its theme, so a card without its name means the
// stand-in no longer models what the renderer does.
for (const { row, markup } of renderedCards) {
  if (!visibleText(markup).includes(row[0])) {
    fail(
      `verify.mjs rendered the ${row[0]} card without its name, so its stand-in DOM no longer models what ` +
        `renderTheme() does (or the card stopped naming its theme).${pageScriptNote} Update the card checks.`,
    );
  }
}

// The same command shown rather than copied — the cards' old `> theme <slug>`
// prompt, the hero's `> theme deep-field`, `<code>/theme graphite</code>` —
// teaches the same dead end. A theme's slug or name counts as an argument
// right after `/theme`, after `theme` behind a `>` prompt glyph, and a
// hyphenated slug after `theme` counts anywhere, since it is never prose.
// Inside an element that displays a command, a slug as typed (lowercase)
// after `theme` counts however the prompt glyph is drawn; a capitalised
// name there is a label ("Save theme Absinthe"), not a command. None of
// these reach across a line break. Prose that names a theme, such as
// 'Applied theme Graphite', "the theme Static", or "Run /theme" with the
// name on the next line, stays legal.
const themeSlugs = [...files, ...vol2Files].map((file) => file.replace(/\.json$/, ""));
const asAlternatives = (words) =>
  [...new Set(words)]
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[^\\S\\n]+"))
    .join("|");
const themeArgument = `(${asAlternatives([...themeSlugs, ...renderedCards.map(({ row }) => row[0])])})(?![\\w-])`;
const anywherePatterns = [
  new RegExp(`(?:/|>)[^\\S\\n]*theme[^\\S\\n]+${themeArgument}`, "i"),
  new RegExp(`\\btheme[^\\S\\n]+(${asAlternatives(themeSlugs.filter((slug) => slug.includes("-")))})(?![\\w-])`, "i"),
];
const commandPattern = new RegExp(`\\b(?:theme|Theme|THEME)[^\\S\\n]+(${asAlternatives(themeSlugs)})(?![\\w-])`);
const readable = (where, markup) => [
  { where, text: visibleText(markup), patterns: anywherePatterns },
  ...attributeValues(markup).map((text) => ({ where: `${where}, in an attribute`, text, patterns: anywherePatterns })),
  ...commandTexts(markup).map((text) => ({ where, text, patterns: [commandPattern] })),
];
for (const { where, text, patterns } of [
  ...readable("the page", html),
  ...jsonLdStrings.map((text) => ({ where: "its JSON-LD", text, patterns: anywherePatterns })),
  ...renderedCards.flatMap(({ row, markup }) => readable(row[0], markup)),
]) {
  for (const pattern of patterns) {
    const shown = text.match(pattern);
    if (shown) {
      fail(
        `index.html shows "theme ${shown[1]}" as a command (${where}). Claude Code's /theme ignores the ` +
          `argument; show /theme and name the theme to choose.${pageScriptNote}`,
      );
    }
  }
}

// The install guide (its HowTo steps included) and the semantic-colours
// article tell readers to set their terminal to "the theme's surface hex from
// the gallery". The cards only ever printed the accent hex; the surface value
// lived in an inline style nobody can read without devtools, so a reader
// following the steps would paint their terminal in a bright accent colour.
// Wherever a public page promises it, every rendered card must show
// "surface" followed closely by that card's own surface hex, as visible text
// (an attribute or a comment does not count; any styling around it does).
const surfacePromisedBy = [];
for (const file of publicHtmlFiles) {
  const source = await readFile(new URL(file, root), "utf8");
  if (/surface hex/i.test(source)) surfacePromisedBy.push(file);
}
if (surfacePromisedBy.length) {
  for (const { row, markup } of renderedCards) {
    const bg = row[5];
    if (!new RegExp(`surface\\b[^#]{0,12}${bg}(?![0-9a-f])`, "i").test(visibleText(markup))) {
      fail(
        `${surfacePromisedBy.join(", ")} promise a surface hex in the gallery, but the ${row[0]} card does not ` +
          `print "surface ${bg}" as visible text.${pageScriptNote}`,
      );
    }
  }
}

// A live region only announces while it is in the accessibility tree, and the
// body of a closed <details> is not. The copy confirmation lived inside the
// closed-by-default theme archive, so copying from a Vol. 2 card — which sits
// outside the archive and is always visible — announced nothing at all.
// A <summary> renders while closed, so a live region in a top-level summary is
// fine. role="status|alert|log" and <output> are live regions too. Walk the
// markup (comments, <style> and <script> removed) so nesting is counted
// properly and a "<details>" mentioned in CSS or JS cannot trip the check.
for (const file of publicHtmlFiles) {
  const source = await readFile(new URL(file, root), "utf8");
  const markup = source.replace(/<!--[\s\S]*?-->/g, "").replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, "");
  let depth = 0;
  let inSummary = 0;
  // Every start tag's attributes are inspected, <details> and <summary> included:
  // a region on a nested <summary> inside the closed body is just as silent.
  for (const [tagText, closing, tagName, attrs] of markup.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const tag = tagName.toLowerCase();
    if (closing) {
      if (tag === "details") depth = Math.max(0, depth - 1);
      if (tag === "summary") inSummary = Math.max(0, inSummary - 1);
      continue;
    }
    if (tag === "summary") inSummary += 1;
    const live =
      tag === "output" ||
      /\baria-live\s*=\s*["']?(?!off\b)[a-z]/i.test(attrs) ||
      /\brole\s*=\s*["']?(?:status|alert|log)\b/i.test(attrs);
    if (live && (depth > 1 || (depth === 1 && !inSummary))) {
      fail(`${file} puts a live region inside a <details> body, silent whenever the disclosure is closed: ${tagText}`);
    }
    if (tag === "details") depth += 1;
  }
}

// The share image's alt text said its colour strip showed "the pack's accent
// colors". The strip is the site's own syntax-role palette: seven of its eight
// colours appear in no theme at all, and the eighth is a text colour. If any
// alt text claims theme accents again, every colour in the strip must be one.
const accentClaims = [];
for (const file of publicHtmlFiles) {
  const source = await readFile(new URL(file, root), "utf8");
  if (/image:alt" content="[^"]*accent colou?rs/i.test(source)) accentClaims.push(file);
}
if (accentClaims.length) {
  const tokens = new Map([...socialCard.matchAll(/--([a-z-]+):(#[0-9a-f]{6})/gi)].map(([, k, v]) => [k, v.toUpperCase()]));
  const strip = [...socialCard.matchAll(/\.roles i:nth-child\(\d+\)\{background:var\(--([a-z-]+)\)\}/g)].map(([, k]) => tokens.get(k));
  const accents = new Set();
  for (const file of files) accents.add(JSON.parse(await readFile(new URL(file, root), "utf8")).overrides.claude.toUpperCase());
  for (const file of vol2Files) accents.add(JSON.parse(await readFile(new URL(file, vol2ThemesRoot), "utf8")).overrides.claude.toUpperCase());
  const strangers = strip.filter((hex) => !accents.has(hex));
  if (!strip.length || strangers.length) {
    fail(
      `${accentClaims.join(", ")} describe the share card's strip as theme accent colours, but ` +
        `${strangers.length || "all"} of its colours are not any theme's accent (${strangers.join(", ")}).`,
    );
  }
}

// The finder says it searches by file name. Readers meet the files as
// `graphite.json` (the repo, the manual-install `cp *.json`), so the search
// text must carry the real name, extension included, not just the stem.
// Check the behaviour rather than one spelling of the promise: any visible
// mention of file names arms it; the card's search text itself must carry
// `${themeSlug}.json`; and every real theme file must be what the page's own
// slug() produces from the theme's name, or that search finds nothing.
const visibleCopy = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, "");
if (/file ?names?/i.test(visibleCopy)) {
  const searchable = html.match(/const searchable = `([^`]*)`/);
  if (!searchable) {
    fail("index.html promises file-name search, but no card search text (const searchable) was found; the guard would be inert.");
  } else if (!searchable[1].includes("${themeSlug}.json")) {
    fail("index.html says the finder searches by file name, but the cards' search text lacks ${themeSlug}.json.");
  }
  const pageSlug = 'const slug = n => n.toLowerCase().replace(/ /g,"-");';
  if (!html.includes(pageSlug)) {
    fail("index.html's slug() changed; update the mirror in verify.mjs so file-name search is still checked.");
  }
  const mirrorSlug = (name) => name.toLowerCase().replace(/ /g, "-");
  for (const [dir, list] of [[root, files], [vol2ThemesRoot, vol2Files]]) {
    for (const file of list) {
      const { name } = JSON.parse(await readFile(new URL(file, dir), "utf8"));
      if (`${mirrorSlug(name)}.json` !== file) {
        fail(`Searching "${file}" finds nothing: the page derives "${mirrorSlug(name)}.json" from "${name}".`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// One page per theme under theme/<slug>/ is rendered from the theme files by
// scripts/build-theme-pages.mjs. A page states hex values, measured ratios and
// an install command, so it is a public claim: every page on disk must be
// byte-for-byte what the builder renders from today's files, no page may exist
// for a theme that does not, and sitemap.xml must list each one (the builder
// owns the sitemap for that reason).
// ---------------------------------------------------------------------------
const { buildThemePages, CONTRAST_CHECKS: pageFloors } = await import("./build-theme-pages.mjs");
const { contrastFloors } = await import("./verify-contrast.mjs");
// Each theme page prints its floors and says they are the ones
// verify-contrast.mjs checks. The builder keeps its own list, so hold it to that
// one: the same tokens, floors and surfaces, in the same order.
const floorKey = ({ token, floor, surfaces }) => `${token} ${floor} ${surfaces.join("+")}`;
if (pageFloors.map(floorKey).join("|") !== contrastFloors.map(floorKey).join("|")) {
  const pageOnly = pageFloors.map(floorKey).filter((key) => !contrastFloors.map(floorKey).includes(key));
  const checkedOnly = contrastFloors.map(floorKey).filter((key) => !pageFloors.map(floorKey).includes(key));
  fail(
    "scripts/build-theme-pages.mjs states contrast floors that scripts/verify-contrast.mjs does not check " +
      `(pages only: ${pageOnly.join(", ") || "none"}; checked only: ${checkedOnly.join(", ") || "none"}).`,
  );
}
const themePages = await buildThemePages(root);
for (const [path, expected] of themePages) {
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
  // The dead command again: #59's pages showed `> theme <slug>` in the
  // specimen and offered `/theme <slug>` as a copy panel on all 62 pages, a
  // command that opens the same picker as `/theme` and applies nothing.
  for (const { where, text, patterns } of readable("the page", source)) {
    for (const pattern of patterns) {
      const shown = text.match(pattern);
      if (shown) {
        fail(
          `${path} shows "theme ${shown[1]}" as a command (${where}). Claude Code's /theme ignores the ` +
            "argument; show /theme and name the theme to choose.",
        );
      }
    }
  }
  // The plugin restart note, as for the root pages above: #59's pages and
  // their index gave the install command and went straight to /theme.
  const pageText = source
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");
  // The single-file route's own "restart it once" (about a new themes folder)
  // sits within reach, so the note must be about the open session or plugins.
  const pluginRestart = /[^.]*\brestart\b[^.]*\b(?:open|plugin)|[^.]*\b(?:open|plugin)\b[^.]*\brestart/i;
  for (const command of pageText.matchAll(/plugin install [\w-]+@notgabriels-themes/g)) {
    if (!pluginRestart.test(pageText.slice(command.index, command.index + 700))) {
      fail(
        `${path} gives "${command[0]}" without saying to restart Claude Code if it was open. Plugin themes ` +
          "load when Claude Code starts, so a session open during the install lists none of them in /theme.",
      );
    }
  }
  // Token roles, as items 7 and 26 found them in Claude Code 2.1.302: `subtle`
  // is drawn as text far more than as hairlines, and `permission` and
  // `planMode` colour text although they are held to the non-text floor.
  // #59's pages called `subtle` "decorative … carries no meaning" and labelled
  // both rows plain "WCAG AA, non-text".
  const subtleRole = source.match(/<code>subtle<\/code><\/td><td>([^<]*)<\/td>/);
  if (subtleRole && /decorative|no meaning|reserved/i.test(subtleRole[1])) {
    fail(`${path} describes subtle as "${subtleRole[1]}"; Claude Code draws de-emphasised text in it.`);
  }
  for (const row of source.matchAll(/<td>(permission|planMode) on terminal background<\/td>(?:<td[^>]*>[\s\S]*?<\/td>){3}<td class="ok">([^<]*)<\/td>/g)) {
    if (!/\btext\b/i.test(row[2].replace(/non-text/gi, ""))) {
      fail(`${path} labels its ${row[1]} row "${row[2]}" as if it were non-text only; Claude Code also draws text in it.`);
    }
  }
  // Copy buttons need a way to tell a screen reader the copy happened: their
  // aria-label outlasts the visible "Copied", and #59's pages had no live
  // region, as the storefront's Vol. 2 copies once did (item 3).
  if (source.includes("data-copy=")) {
    const liveRegion = source.match(/<[a-z]+\b[^>]*\bid="([\w-]+)"[^>]*\baria-live="(?:polite|assertive)"[^>]*>|<[a-z]+\b[^>]*\baria-live="(?:polite|assertive)"[^>]*\bid="([\w-]+)"[^>]*>/);
    const regionId = liveRegion && (liveRegion[1] || liveRegion[2]);
    if (!regionId || !source.includes(`getElementById("${regionId}")`)) {
      fail(`${path} has copy buttons but no live region the copy script writes to, so a screen reader hears nothing when a copy succeeds or fails.`);
    }
  }
  // index.html defines #plugin as the 50-theme plugin. #59 had all 12 Vol. 2
  // pages and the two-pack index declare they were about it.
  if (source.includes('"@id": "https://gabs-utilities.com/#plugin"')
    && (source.includes("dark-themes-vol-2@notgabriels-themes") || path === "theme/index.html")) {
    fail(`${path} says in its structured data that it is about #plugin, the 50-theme plugin, which does not hold every theme it covers.`);
  }
  if (!source.includes('rel="icon" type="image/svg+xml" href="/favicon.svg"')) {
    fail(`${path} must expose the first-party SVG favicon.`);
  }
  for (const match of source.matchAll(/https:\/\/notgabriel\.gumroad\.com\/l\/([a-z0-9-]+)/g)) {
    if (!verifiedGumroadSlugs.has(match[1])) {
      fail(`${path} contains an unverified or unavailable Gumroad product link: ${match[1]}.`);
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

console.log(
  `Verified ${files.length} themes, ${pluginFiles.length} plugin themes, ${vol2Files.length} Vol. 2 themes, ` +
    `${galleryThemes.length} gallery cards, ` +
    `${verifiedGumroadSlugs.size} Gumroad products, ${verifiedPayPalIds.length} PayPal links, ` +
    `the stated ${roleAwareComparisonCount}-check claims, and the safe install command.`,
);
