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

// ---------------------------------------------------------------------------
// One page per theme under theme/<slug>/ is rendered from the theme files by
// scripts/build-theme-pages.mjs. A page states hex values, measured ratios and
// an install command, so it is a public claim: every page on disk must be
// byte-for-byte what the builder renders from today's files, no page may exist
// for a theme that does not, and sitemap.xml must list each one (the builder
// owns the sitemap for that reason).
// ---------------------------------------------------------------------------
const { buildThemePages } = await import("./build-theme-pages.mjs");
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

// Site base in the Familiars look (assets/site.css and assets/site.js). The rules and their
// messages live in scripts/site-style.mjs; pages join STYLED_PAGES as they move onto it.
const siteStyle = await import("./site-style.mjs");
for (const problem of siteStyle.stylesheetProblems(await readFile(new URL(siteStyle.STYLESHEET, root), "utf8"))) fail(problem);
for (const path of siteStyle.STYLED_PAGES) {
  for (const problem of siteStyle.pageProblems(path, await readFile(new URL(path, root), "utf8"))) fail(problem);
}

console.log(
  `Verified ${files.length} themes, ${pluginFiles.length} plugin themes, ${vol2Files.length} Vol. 2 themes, ` +
    `${galleryThemes.length} gallery cards, ` +
    `${verifiedGumroadSlugs.size} Gumroad products, ${verifiedPayPalIds.length} PayPal links, ` +
    `the stated ${roleAwareComparisonCount}-check claims, and the safe install command.`,
);
