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
// Buyer-side read-back on 2026-08-24 confirmed these product pages return a
// published Gumroad product. A plausible URL or HTTP 200 is not enough:
// unpublished Gumroad products can still render a 200-status product shell.
const verifiedGumroadSlugs = new Set([
  "bqgfv",
  "bunkhy",
  "cfcvmy",
  "ckthsb",
  "dark-app-screens",
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

function fail(message) {
  throw new Error(message);
}

const files = (await readdir(root))
  .filter((file) => file.endsWith(".json"))
  .sort();

if (files.length !== 50) {
  fail(`Expected 50 root-level theme files; found ${files.length}.`);
}

const names = new Set();
for (const file of files) {
  const source = await readFile(new URL(file, root), "utf8");
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
}

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

const marketplace = JSON.parse(await readFile(new URL(".claude-plugin/marketplace.json", root), "utf8"));
const pluginManifest = JSON.parse(await readFile(new URL(".claude-plugin/plugin.json", pluginRoot), "utf8"));
if (marketplace.name !== "notgabriels-themes") fail("Unexpected marketplace name.");
if (marketplace.plugins?.length !== 1) fail("The marketplace must expose exactly one plugin.");
if (marketplace.plugins[0].name !== "50-dark-themes") fail("Unexpected marketplace plugin name.");
if (marketplace.plugins[0].source !== "./plugins/50-dark-themes") fail("Unexpected plugin source path.");
if (pluginManifest.name !== "50-dark-themes") fail("Unexpected plugin manifest name.");
if (pluginManifest.experimental?.themes !== "./themes/") fail("Plugin manifest must expose ./themes/.");
if (!/^\d+\.\d+\.\d+$/.test(pluginManifest.version)) fail("Plugin version must use semantic versioning.");
if (marketplace.plugins[0].version !== pluginManifest.version) {
  fail("Marketplace and plugin manifest versions must match.");
}

const html = await readFile(new URL("index.html", root), "utf8");
const readme = await readFile(new URL("README.md", root), "utf8");
const publicHtmlFiles = (await readdir(root))
  .filter((file) => file.endsWith(".html"))
  .sort();
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
for (const name of names) {
  if (!galleryNames.has(name)) fail(`Gallery is missing the ${name} theme.`);
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
  `Verified ${files.length} themes, ${pluginFiles.length} plugin themes, ${galleryThemes.length} gallery cards, ` +
    `${verifiedGumroadSlugs.size} Gumroad products, ${verifiedPayPalIds.length} PayPal links, and the safe install command.`,
);
