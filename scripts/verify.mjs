import { readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
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

const html = await readFile(new URL("index.html", root), "utf8");
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

if (!html.includes("mkdir -p ~/.claude/themes")) {
  fail("The install command must create ~/.claude/themes before copying files.");
}
if (html.includes("notgabriel.gumroad.com/l/wmlrk")) {
  fail("Do not restore the résumé checkout until its download is verified.");
}
if (/stripe/i.test(html)) {
  fail("No Stripe link is verified for this site.");
}
for (const id of verifiedPayPalIds) {
  if (!html.includes(`https://www.paypal.com/ncp/payment/${id}`)) {
    fail(`Verified PayPal link ${id} is missing.`);
  }
}

console.log(
  `Verified ${files.length} themes, ${galleryThemes.length} gallery cards, ` +
    `${verifiedPayPalIds.length} PayPal links, and the safe install command.`,
);
