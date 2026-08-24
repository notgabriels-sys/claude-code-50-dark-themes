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

// The Gumroad products currently on the shop, and the price each one prints on
// this page. Recorded 2026-08-24; 18 slugs at first count, 16 after two audio
// products were retired the same day.
//
// READ THIS BEFORE ADDING OR CHANGING A ROW. Unlike verifiedPayPalLinks above,
// this table is deliberately WEAKER, and the difference is the whole point:
//
//   verifiedPayPalLinks  = "a human opened paypal.com/ncp/links/<ID> and read
//                           this price back off the provider's own object."
//   recordedGumroadPrices = "this is what index.html said on 2026-08-24."
//
// The second asserts NOTHING about Gumroad. No Gumroad product object has ever
// been read by anyone working in this repo -- see CLAUDE.md, "Gumroad -- the
// unverified half of the shop". A wrong price on the page is copied faithfully
// into this table and the build stays green.
//
// What it does buy is drift detection: a slug cannot silently change, appear or
// disappear, no link can point at a lookalike host, and a price cannot be
// edited on the page without the edit being deliberate. That is worth having on
// its own -- it is how a stray keystroke or a bad merge gets caught -- but it is
// not verification, and it must never be described as verification.
//
// pagePrice null means the card prints no <i> price element: `slhbym` is the
// free zip, and `wuhehk` is the bundle, whose price lives in its own line of
// copy and is checked there instead.
//
// Two rows are in USD on an otherwise-EUR page (`cfcvmy` $19, `xcxeb` $9, and
// the bundle's copy reads $39). That inconsistency is recorded here on purpose
// rather than smoothed over. Do NOT resolve it by editing index.html; it is
// resolved by reading the real products in a signed-in browser.
const recordedGumroadPrices = [
  { slug: "slhbym", pagePrice: null },
  { slug: "ckthsb", pagePrice: "€12" },
  { slug: "cfcvmy", pagePrice: "$19" },
  { slug: "dark-app-screens", pagePrice: "€14" },
  { slug: "xjcbji", pagePrice: "€9" },
  { slug: "bunkhy", pagePrice: "€9" },
  { slug: "zvbti", pagePrice: "€12" },
  { slug: "kxsfa", pagePrice: "€7" },
  { slug: "kykega", pagePrice: "€7" },
  { slug: "wgtbkq", pagePrice: "€7" },
  { slug: "bqgfv", pagePrice: "€8" },
  { slug: "jqrdfy", pagePrice: "€6" },
  { slug: "xcxeb", pagePrice: "$9" },
  { slug: "wuhehk", pagePrice: null, copyPrice: "$39" },
  // mix-revision-mastering-handoff-kit and techno-mix-preflight-toolkit were
  // removed from the shop on 2026-08-24 together with their whole product
  // directories; the guard caught their disappearance and they are dropped here
  // deliberately, not to silence it.
  { slug: "raw-techno-kick-architecture", pagePrice: "€15" },
  { slug: "industrial-tension-fx", pagePrice: "€15" },
];
const knownGumroadSlugs = recordedGumroadPrices.map((entry) => entry.slug);

const GUMROAD_HOST = "notgabriel.gumroad.com";

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
const expectedPlugins = [
  { name: "50-dark-themes", source: "./plugins/50-dark-themes" },
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
//
// Capture to a DELIMITER ([^"'\s<>]+), never to a permitted character class.
// An earlier version used ([A-Z0-9]+); .../3SWZ64EXW9C8Wx then truncated to the
// known id 3SWZ64EXW9C8W and a EUR1,200 lookalike link passed CI. The Gumroad
// slug pattern had the same defect with a dot suffix. Both were reproduced,
// then fixed. Do not narrow these back to a character class.
const presentPayPalIds = [
  ...html.matchAll(/paypal\.com\/ncp\/payment\/([^"'\s<>]+)/g),
].map((match) => match[1]);
for (const id of new Set(presentPayPalIds)) {
  if (!verifiedPayPalIds.includes(id)) {
    fail(
      `Unverified PayPal link ${id} is on the page. Read it back from ` +
        `paypal.com/ncp/links/${id} and add it to verifiedPayPalLinks first.`,
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

const presentGumroadSlugs = [
  ...html.matchAll(/notgabriel\.gumroad\.com\/l\/([^"'\s<>]+)/g),
].map((match) => match[1]);

const duplicateSlugs = presentGumroadSlugs.filter(
  (slug, index) => presentGumroadSlugs.indexOf(slug) !== index,
);
if (duplicateSlugs.length > 0) {
  fail(`Duplicate Gumroad slug on the page: ${[...new Set(duplicateSlugs)].join(", ")}.`);
}

for (const slug of presentGumroadSlugs) {
  if (!knownGumroadSlugs.includes(slug)) {
    fail(
      `Unknown Gumroad slug "${slug}" is on the page. Confirm it is the product ` +
        `you mean at gumroad.com, then add it to knownGumroadSlugs.`,
    );
  }
}
for (const slug of knownGumroadSlugs) {
  if (!presentGumroadSlugs.includes(slug)) {
    fail(
      `Gumroad slug "${slug}" has disappeared from the page. Remove it from ` +
        `knownGumroadSlugs if that was deliberate.`,
    );
  }
}

// Page-price drift. This checks index.html against recordedGumroadPrices above
// and NOTHING ELSE -- read that table's comment before trusting a green build
// here. It catches an unintended edit; it cannot catch a price that was wrong
// on the day it was recorded.
//
// Quote-exact on the closing quote, for the same reason the PayPal checks are:
// a pattern that stopped at a character class would read the card for `bqgfvX`
// as the card for `bqgfv` and check the wrong product's price.
for (const { slug, pagePrice, copyPrice } of recordedGumroadPrices) {
  const card = html.match(
    new RegExp(`<a[^>]*href="https://${GUMROAD_HOST}/l/${slug}"[^>]*>([\\s\\S]*?)</a>`),
  );
  if (!card) {
    fail(`Could not read the card wrapping Gumroad link ${slug}.`);
    continue;
  }
  const priceTag = card[1].match(/<i>([^<]*)<\/i>/);
  const shown = priceTag ? priceTag[1] : null;

  if (pagePrice === null && shown !== null) {
    fail(
      `Gumroad card ${slug} now prints a price element <i>${shown}</i> and did ` +
        `not before. Read the real product at gumroad.com, then record it in ` +
        `recordedGumroadPrices.`,
    );
  } else if (pagePrice !== null && shown === null) {
    fail(`Gumroad card ${slug} has lost its <i>${pagePrice}</i> price element.`);
  } else if (pagePrice !== null && shown !== pagePrice) {
    fail(
      `Gumroad card ${slug} shows ${shown}; recordedGumroadPrices says ` +
        `${pagePrice}. If the change is deliberate, read the real product back ` +
        `from gumroad.com first, then update the table.`,
    );
  }

  // The bundle states its price in its own line of copy rather than an <i>.
  if (copyPrice && !card[1].includes(copyPrice)) {
    fail(
      `Gumroad card ${slug} no longer states ${copyPrice} in its copy; ` +
        `recordedGumroadPrices still expects it.`,
    );
  }
}

console.log(
  `Verified ${files.length} themes, ${pluginFiles.length} plugin themes, ${galleryThemes.length} gallery cards, ` +
    `${verifiedPayPalIds.length} PayPal links, ${knownGumroadSlugs.length} Gumroad slugs ` +
    `(prices checked against the recorded page, NOT against Gumroad), ` +
    `${sourceSkills.length} skills, and the safe install command.`,
);
