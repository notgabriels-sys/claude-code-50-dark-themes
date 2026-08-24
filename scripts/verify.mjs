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

// The 18 Gumroad product slugs currently on the shop, recorded 2026-08-24.
//
// READ THIS BEFORE ADDING ONE. Unlike verifiedPayPalLinks above, this list is
// deliberately WEAKER: it asserts only "this slug is known and intentional",
// NOT "its price and contents were read back from the real Gumroad product".
// No Gumroad product has ever had that treatment -- see CLAUDE.md. Adding a
// slug here silences the guard; it does not verify anything.
//
// What it does buy: a slug cannot silently change, appear, or disappear, and
// no link can point at a lookalike host. That is the structural half of the
// protection the PayPal links get. The price half is still unbuilt because no
// verified Gumroad table exists yet.
const knownGumroadSlugs = [
  "slhbym",
  "ckthsb",
  "cfcvmy",
  "dark-app-screens",
  "xjcbji",
  "bunkhy",
  "zvbti",
  "kxsfa",
  "kykega",
  "wgtbkq",
  "bqgfv",
  "jqrdfy",
  "xcxeb",
  "wuhehk",
  "mix-revision-mastering-handoff-kit",
  "techno-mix-preflight-toolkit",
  "raw-techno-kick-architecture",
  "industrial-tension-fx",
];
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
  ...html.matchAll(/notgabriel\.gumroad\.com\/l\/([A-Za-z0-9_-]+)/g),
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

console.log(
  `Verified ${files.length} themes, ${pluginFiles.length} plugin themes, ${galleryThemes.length} gallery cards, ` +
    `${verifiedPayPalIds.length} PayPal links, ${knownGumroadSlugs.length} Gumroad slugs, ` +
    `${sourceSkills.length} skills, and the safe install command.`,
);
