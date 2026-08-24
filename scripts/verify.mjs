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

const html = await readFile(new URL("index.html", root), "utf8");
const readme = await readFile(new URL("README.md", root), "utf8");
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
if (html.includes("notgabriel.gumroad.com/l/wmlrk")) {
  fail("Do not restore the résumé checkout until its download is verified.");
}
if (/stripe/i.test(html)) {
  fail("No Stripe link is verified for this site.");
}
for (const { id, price } of verifiedPayPalLinks) {
  const href = `https://www.paypal.com/ncp/payment/${id}`;
  if (!html.includes(href)) {
    fail(`Verified PayPal link ${id} is missing.`);
  }
  const card = html.match(
    new RegExp(`<a[^>]*href="${href}"[^>]*>([\\s\\S]*?)</a>`),
  );
  if (!card) {
    fail(`Could not read the card wrapping PayPal link ${id}.`);
  } else if (!card[1].includes(`<i>${price}</i>`)) {
    fail(
      `PayPal link ${id} must charge ${price} per the verified rate card; ` +
        `its card on the page does not say so.`,
    );
  }
}

// The checks above prove the three verified links are present and correctly
// priced. This one proves nothing else got added: a fourth NCP link is an
// unverified charge on a public shop, which is the exact failure this repo
// already paid for once.
const presentPayPalIds = [
  ...html.matchAll(/paypal\.com\/ncp\/payment\/([A-Z0-9]+)/g),
].map((match) => match[1]);
for (const id of new Set(presentPayPalIds)) {
  if (!verifiedPayPalIds.includes(id)) {
    fail(
      `Unverified PayPal link ${id} is on the page. Read it back from ` +
        `paypal.com/ncp/links/${id} and add it to verifiedPayPalLinks first.`,
    );
  }
}

console.log(
  `Verified ${files.length} themes, ${pluginFiles.length} plugin themes, ${galleryThemes.length} gallery cards, ` +
    `${verifiedPayPalIds.length} PayPal links, and the safe install command.`,
);
