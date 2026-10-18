import { readdir, readFile, stat } from "node:fs/promises";

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

const { roleAwareComparisonCount } = await import("./verify-contrast.mjs");

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

// The install guide's manual fallback is a procedure people follow verbatim on
// a page that search can land them on directly. It used to open with
// `cp *.json ~/.claude/themes/` and never say where the files come from — the
// page contained no clone, download, archive or curl step at all — so the copy
// silently depended on the reader already standing in a clone. It also copied
// only the root fifty, immediately after introducing Vol. 2 by name, leaving
// anyone without the plugin flow no manual route to the twelve.
const installGuide = await readFile(new URL("claude-code-theme-install-guide.html", root), "utf8");
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
// Card checks read what a visitor sees, not one spelling of the template:
// three review rounds showed every regex over the template either missed a
// refactor (`${esc(themeSlug)}`, `${slug(name)}`) or rejected correct
// styling (`<span class="hex">`). So render each card with the page's own
// renderTheme() and the helpers above it, then reduce it to visible text.
// If that block moves, fail loudly rather than skip the checks.
const rendererStart = html.indexOf("const slug = ");
const rendererAt = html.indexOf("const renderTheme = ");
const rendererEnd = rendererAt < 0 ? -1 : html.indexOf("\n};\n", rendererAt);
if (rendererStart < 0 || rendererAt < rendererStart || rendererEnd < 0) {
  fail("Could not find slug() through renderTheme() in index.html; update the card checks in verify.mjs.");
}
const renderCard = new Function(`${html.slice(rendererStart, rendererEnd + 3)}\nreturn renderTheme;`)();
const visibleText = (markup) =>
  markup
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const renderedCards = [...galleryThemes, ...vol2Gallery].map((row) => ({ row, text: visibleText(renderCard(row)) }));

// The same command shown rather than copied — the cards' old `> theme <slug>`
// prompt, the hero's `> theme deep-field`, `<code>/theme graphite</code>` —
// teaches the same dead end. Keyed to the real slugs, so prose such as "Run
// /theme and choose one" or 'Applied theme "Deep Field"' stays legal.
const themeSlugs = [...files, ...vol2Files].map((file) => file.replace(/\.json$/, ""));
const shownCommandPattern = new RegExp(`\\btheme\\s+(${themeSlugs.join("|")})(?![a-z0-9-])`, "i");
for (const { row, text } of [{ row: ["the page"], text: visibleText(html) }, ...renderedCards]) {
  const shown = text.match(shownCommandPattern);
  if (shown) {
    fail(
      `index.html shows "theme ${shown[1]}" as a command (${row[0]}). Claude Code's /theme ignores the ` +
        "argument; show /theme and name the theme to choose.",
    );
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
  for (const { row, text } of renderedCards) {
    const bg = row[5];
    if (!new RegExp(`surface\\b[^#]{0,12}${bg}(?![0-9a-f])`, "i").test(text)) {
      fail(
        `${surfacePromisedBy.join(", ")} promise a surface hex in the gallery, but the ${row[0]} card does not ` +
          `print "surface ${bg}" as visible text.`,
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

console.log(
  `Verified ${files.length} themes, ${pluginFiles.length} plugin themes, ${vol2Files.length} Vol. 2 themes, ` +
    `${galleryThemes.length} gallery cards, ` +
    `${verifiedGumroadSlugs.size} Gumroad products, ${verifiedPayPalIds.length} PayPal links, ` +
    `the stated ${roleAwareComparisonCount}-check claims, and the safe install command.`,
);
