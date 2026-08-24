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

// Buyer-side read-back on 2026-08-24 confirmed these product pages return a
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
if (!/^\d+\.\d+\.\d+$/.test(pluginManifest.version)) fail("Plugin version must use semantic versioning.");
if (marketplace.plugins[0].version !== pluginManifest.version) {
  fail("Marketplace and plugin manifest versions must match.");
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
  try {
    await readFile(new URL(imagePath, root));
  } catch {
    fail(`Curated developer pick cover is missing: ${imagePath}.`);
  }

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
const gumroadSlugOf = (raw) => raw.split(/[?#]/, 1)[0];
const gumroadLinkPattern = /https:\/\/notgabriel\.gumroad\.com\/l\/([^"'\s<>)]+)/g;

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
  const stated = [...card[1].matchAll(/[€$]\s?\d[\d.,]*/g)].map((match) =>
    match[0].replace(/\s+/g, ""),
  );
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

// Every Gumroad anchor on the shop page, with the slug it points at and the
// text it wraps. Slugs go through gumroadSlugOf, so the developer-picks row's
// `?utm_source=...` resolves to the product it names while `bqgfvX` stays
// `bqgfvX` and fails the allowlist.
const gumroadCards = [
  ...html.matchAll(
    /<a\b([^>]*)href="https:\/\/notgabriel\.gumroad\.com\/l\/([^"'\s<>]+)"([^>]*)>([\s\S]*?)<\/a>/g,
  ),
].map((match) => ({
  slug: gumroadSlugOf(match[2]),
  attrs: `${match[1]} ${match[3]}`,
  inner: match[4],
}));

// A Gumroad URL printed outside an anchor would escape every price check below
// without this. The two counts must agree.
const rawGumroadLinks = [...html.matchAll(gumroadLinkPattern)];
if (rawGumroadLinks.length !== gumroadCards.length) {
  fail(
    `index.html has ${rawGumroadLinks.length} Gumroad URLs but only ` +
      `${gumroadCards.length} of them are inside an <a> the price guard can read.`,
  );
}

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
const currencyWords = { "€": "euros", $: "dollars" };
for (const { slug, attrs, inner } of gumroadCards) {
  const price = recordedGumroadPriceBySlug.get(slug);
  const shown = [...inner.matchAll(/[€$]\s?\d[\d.,]*/g)].map((match) =>
    match[0].replace(/\s+/g, ""),
  );

  if (price === null) {
    if (shown.length > 0) {
      fail(
        `Gumroad card ${slug} now states ${shown.join(", ")} and recordedGumroadPrices ` +
          `says it states no price. Read the real product at gumroad.com, then record it.`,
      );
    }
  } else if (shown.length === 0) {
    fail(`Gumroad card ${slug} no longer states its ${price} price.`);
  } else {
    for (const amount of shown) {
      if (amount !== price) {
        fail(
          `Gumroad card ${slug} states ${amount}; recordedGumroadPrices says ${price}. ` +
            `If the change is deliberate, read the real product back from gumroad.com ` +
            `first, then update the table.`,
        );
      }
    }
  }

  const spoken = attrs.match(/aria-label="[^"]*?for (\d[\d.,]*) (euros|dollars)"/);
  if (spoken) {
    const expected = price && `${price[0]}${spoken[1]}`;
    if (!price) {
      fail(`Gumroad card ${slug} speaks a price in its aria-label but records none.`);
    } else if (expected !== price || currencyWords[price[0]] !== spoken[2]) {
      fail(
        `Gumroad card ${slug} reads out "${spoken[1]} ${spoken[2]}" to screen readers ` +
          `but is priced ${price}.`,
      );
    }
  }
}

await import("./verify-contrast.mjs");

console.log(
  `Verified ${files.length} themes, ${pluginFiles.length} plugin themes, ${galleryThemes.length} gallery cards, ` +
    `${verifiedGumroadSlugs.size} Gumroad products (prices checked against the recorded page, NOT against Gumroad), ` +
    `${verifiedPayPalIds.length} PayPal links, ${sourceSkills.length} skills, and the safe install command.`,
);
