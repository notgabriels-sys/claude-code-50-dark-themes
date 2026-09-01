import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const coverPath = "assets/products/dark-ui-kit.png";
const previewImagePath = "assets/products/dark-ui-kit-components.png";

async function makeFixture(t) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gabs-storefront-verify-"));
  const fixtureRoot = join(temporaryRoot, "repo");

  await cp(projectRoot, fixtureRoot, {
    recursive: true,
    filter(source) {
      const pathFromRoot = relative(projectRoot, source);
      const isExcludedDirectory = [".git", ".worktrees"].some(
        (directory) => pathFromRoot === directory || pathFromRoot.startsWith(`${directory}${sep}`),
      );
      return !isExcludedDirectory;
    },
  });

  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  return fixtureRoot;
}

async function runVerifier(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/verify.mjs"], { cwd });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function runNodeScript(cwd, script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function runContrastVerifier(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/verify-contrast.mjs"], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("rejects semantic palette drift in a shared storefront role", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureHtml = join(fixtureRoot, "index.html");
  const html = await readFile(fixtureHtml, "utf8");
  await writeFile(fixtureHtml, html.replace("--syntax-blue:#8eaadf;", "--syntax-blue:#000000;"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a storefront with an unreadable semantic role");
  assert.match(result.stderr, /Storefront: --syntax-blue on --terminal-surface/);
});

test("rejects a curated cover with a corrupted PNG signature", { timeout: 30_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureCover = join(fixtureRoot, coverPath);
  const cover = await readFile(fixtureCover);
  cover[0] = 0x00;
  await writeFile(fixtureCover, cover);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a file without a valid PNG signature");
  assert.match(
    result.stderr,
    /Curated developer pick cover must be a valid PNG: assets\/products\/dark-ui-kit\.png\./,
  );
});

test("rejects a curated cover with the wrong pixel dimensions", { timeout: 30_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureCover = join(fixtureRoot, coverPath);
  const cover = await readFile(fixtureCover);
  cover.writeUInt32BE(1279, 16);
  await writeFile(fixtureCover, cover);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a cover with unexpected dimensions");
  assert.match(
    result.stderr,
    /Curated developer pick cover must be 1280x720: assets\/products\/dark-ui-kit\.png\./,
  );
});

test("rejects a storefront that removes the UI kit proof section", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureHtml = join(fixtureRoot, "index.html");
  const html = await readFile(fixtureHtml, "utf8");
  const markerPosition = html.indexOf('id="ui-kit-preview"');
  const sectionStart = markerPosition === -1 ? -1 : html.lastIndexOf("<section", markerPosition);
  const sectionEnd = sectionStart === -1 ? -1 : html.indexOf("</section>", sectionStart);
  const htmlWithoutProof =
    sectionStart === -1 || sectionEnd === -1
      ? html
      : html.slice(0, sectionStart) + html.slice(sectionEnd + "</section>".length);
  await writeFile(fixtureHtml, htmlWithoutProof);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a storefront without UI kit proof");
  assert.match(result.stderr, /The storefront must expose the UI kit preview section\./);
});

test("rejects a UI kit preview with a missing evidence image", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const missingImage = "assets/products/dark-ui-kit-components.png";
  await rm(join(fixtureRoot, missingImage));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a missing UI kit preview image");
  assert.match(result.stderr, /UI kit preview image is missing: assets\/products\/dark-ui-kit-components\.png\./);
});

test("rejects a UI kit preview image with the wrong pixel dimensions", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureImage = join(fixtureRoot, previewImagePath);
  const image = await readFile(fixtureImage);
  image.writeUInt32BE(1264, 16);
  await writeFile(fixtureImage, image);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a preview image with unexpected dimensions");
  assert.match(
    result.stderr,
    /UI kit preview image must be 1265x712: assets\/products\/dark-ui-kit-components\.png\./,
  );
});

test("rejects publishing the paid UI kit stylesheet", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureHtml = join(fixtureRoot, "index.html");
  const html = await readFile(fixtureHtml, "utf8");
  await writeFile(
    fixtureHtml,
    html.replace("</head>", '  <link rel="stylesheet" href="dark-ui.css">\n</head>'),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a public link to the paid stylesheet");
  assert.match(result.stderr, /The storefront must not publish the paid Dark UI Kit stylesheet\./);
});

test("rejects a sales link whose accessible name omits its visible label", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureHtml = join(fixtureRoot, "index.html");
  const html = await readFile(fixtureHtml, "utf8");
  await writeFile(
    fixtureHtml,
    html.replace(
      /aria-label="Preview[^"]*"/,
      'aria-label="Dark UI Kit component proof"',
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted an accessible name that omits visible text");
  assert.match(
    result.stderr,
    /Sales-link accessible name must include its visible label: Preview components\./,
  );
});

test("rejects a share card that states a stale role-aware check count", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureCard = join(fixtureRoot, "assets/social-preview.html");
  const card = await readFile(fixtureCard, "utf8");
  await writeFile(fixtureCard, card.replace("<b>894</b> role-aware", "<b>726</b> role-aware"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a share card claiming a stale check count");
  assert.match(result.stderr, /assets\/social-preview\.html claims 726 role-aware checks/);
});

test("rejects a storefront proofline that states a stale check count", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureHtml = join(fixtureRoot, "index.html");
  const html = await readFile(fixtureHtml, "utf8");
  // The number and the phrase are split by markup here; the guard must still
  // read it, because this is the surface that shipped stale before.
  await writeFile(fixtureHtml, html.replace("<dt>894</dt>", "<dt>900</dt>"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a proofline claiming a stale check count");
  assert.match(result.stderr, /index\.html claims 900 role-aware checks/);
});

test("rejects a share card whose theme counts drift from the shipped packs", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureCard = join(fixtureRoot, "assets/social-preview.html");
  const card = await readFile(fixtureCard, "utf8");
  await writeFile(fixtureCard, card.replace("<b>50 + 12</b> themes", "<b>50 + 14</b> themes"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a share card overstating the theme count");
  assert.match(result.stderr, /claims 50 \+ 14 themes; the repository ships 50 \+ 12/);
});

test("rejects a share card that drops its check-count claim entirely", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureCard = join(fixtureRoot, "assets/social-preview.html");
  const card = await readFile(fixtureCard, "utf8");
  await writeFile(fixtureCard, card.replace("<b>894</b> role-aware checks", "<b>MIT</b> licensed"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier let the claim guard go inert");
  assert.match(result.stderr, /states no role-aware check count; the claim guard would be inert/);
});

test("rejects two pages describing the same share image differently", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "semantic-terminal-colors.html");
  const page = await readFile(fixturePage, "utf8");
  // Consistently within the page, but disagreeing with every other page.
  await writeFile(
    fixturePage,
    page.replaceAll(
      "Title card: 50 dark themes for Claude Code, with the plugin install command and a strip of the pack&#39;s accent colors",
      "Gallery preview of dark Claude Code terminal themes.",
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted one image with two descriptions");
  assert.match(result.stderr, /share https:\/\/gabs-utilities\.com\/preview\.png but describe it differently/);
});

test("rejects a page that ships an og:image with no alternative text", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "claude-code-theme-install-guide.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(fixturePage, page.replace(/<meta property="og:image:alt"[^>]*>\n/, ""));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a share image with no alternative text");
  assert.match(result.stderr, /ships an og:image with no og:image:alt/);
});

test("rejects a page whose X alt disagrees with its Open Graph alt", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "semantic-terminal-colors.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page.replace(
      /<meta name="twitter:image:alt" content="[^"]*">/,
      '<meta name="twitter:image:alt" content="Something else entirely">',
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted contradictory alt text on one page");
  assert.match(result.stderr, /describes the same share image differently to Open Graph and X/);
});

test("rejects a finder whose hidden cards are still painted", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureHtml = join(fixtureRoot, "index.html");
  const html = await readFile(fixtureHtml, "utf8");
  await writeFile(fixtureHtml, html.replace("[hidden]{display:none!important}", ""));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a page that hides cards only in the DOM");
  assert.match(result.stderr, /toggles the hidden property but never overrides it in CSS/);
});

// ---------------------------------------------------------------------------
// The four guards added while merging Dark Themes Vol. 2 had no regression test
// until here. Each was proven to fire by hand at the time it was written, but a
// proof in a transcript is not a proof that survives a refactor: the suite
// stayed green at 16/16 while every one of them could have been gutted
// silently. These re-run that proof on every push.
//
// Each test injects the exact input that shipped green before the guard
// existed, so a regression restores a known, reproduced failure rather than a
// hypothetical one.
// ---------------------------------------------------------------------------

test("rejects a payment slug matched to a permitted-character class", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const verifier = join(fixtureRoot, "scripts/verify.mjs");
  const source = await readFile(verifier, "utf8");
  // The pattern a merge reintroduced: .../l/ckthsbX truncates to the verified
  // slug ckthsb and the lookalike passes every downstream check.
  // Composed from pieces on purpose. The self-check under test scans every
  // scripts/*.mjs, this file included, so a literal bad pattern here would fail
  // the build for the test's own source rather than for the injected fixture.
  const slugPath = ["gumroad", "\\.com", "\\/l", "\\/"].join("");
  const delimiterCapture = `${slugPath}([^"'\\s<>)]+)`;
  const permittedClass = `${slugPath}(${["[a-z0", "-9-]+"].join("")})`;
  assert.ok(source.includes(delimiterCapture), "fixture no longer contains the delimiter capture to swap");
  await writeFile(verifier, source.replace(delimiterCapture, permittedClass));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a slug pattern that truncates a lookalike");
  assert.match(result.stderr, /class of permitted characters/);
});

test("checks sibling scripts for the truncating pattern, not just verify.mjs", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const sibling = join(fixtureRoot, "scripts/verify-contrast.mjs");
  const source = await readFile(sibling, "utf8");
  // Same reason as above: assembled at runtime so this file's own source stays
  // clean while the fixture receives the real thing.
  const bad = ["/notgabriel\\.gumroad\\.com\\/l\\/(", "[a-z0", "-9-]+)/"].join("");
  await writeFile(sibling, `const leak = ${bad};\n${source}`);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the self-check only looked at verify.mjs");
  assert.match(result.stderr, /scripts\/verify-contrast\.mjs/);
});

test("rejects an unverified PayPal link on a page other than index.html", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const page = join(fixtureRoot, "impressum.html");
  const html = await readFile(page, "utf8");
  // This exact shape shipped with CI green: an unverified NCP link, on a public
  // page nobody was watching, is an unverified charge.
  const link = '<a href="https://www.paypal.com/ncp/payment/AAAAUNVERIFIED9">Session</a>';
  await writeFile(page, html.replace("</body>", `${link}\n</body>`));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an unverified PayPal link shipped from a non-index page");
  assert.match(result.stderr, /Unverified PayPal link AAAAUNVERIFIED9 is on impressum\.html/);
});

test("rejects a verified Gumroad slug priced wrongly on another page", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const page = join(fixtureRoot, "impressum.html");
  const html = await readFile(page, "utf8");
  // bqgfv is a verified slug recorded at €8. The allowlist passes it; only the
  // price check catches the number, and it used to read index.html alone.
  const card = '<a href="https://notgabriel.gumroad.com/l/bqgfv">Dark UI Kit — €99</a>';
  await writeFile(page, html.replace("</body>", `${card}\n</body>`));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a wrong price shipped from a non-index page");
  assert.match(result.stderr, /Gumroad card bqgfv on impressum\.html states €99/);
});

test("rejects a Gumroad URL printed outside an anchor on any page", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const page = join(fixtureRoot, "impressum.html");
  const html = await readFile(page, "utf8");
  // Price checks read anchors, so a bare URL would escape them entirely.
  await writeFile(
    page,
    html.replace("</body>", "Buy at https://notgabriel.gumroad.com/l/bqgfv today\n</body>"),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a bare Gumroad URL escaped the price guard");
  assert.match(result.stderr, /impressum\.html has 1 Gumroad URLs but only 0/);
});

test("accepts the correct recorded price on a page other than index.html", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const page = join(fixtureRoot, "impressum.html");
  const html = await readFile(page, "utf8");
  // Negative control. The four tests above must fire on a wrong value, not on
  // the mere presence of a payment link off index.html — a guard that fires on
  // everything proves nothing.
  const card = '<a href="https://notgabriel.gumroad.com/l/bqgfv">Dark UI Kit — €8</a>';
  await writeFile(page, html.replace("</body>", `${card}\n</body>`));

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `the verifier rejected a correctly priced card: ${result.stderr}`);
});

test("rejects a README price that drifts from the recorded one", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const readmePath = join(fixtureRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  await writeFile(readmePath, readme.replace("· €12 |", "· €99 |"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a stale README price shipped green");
  assert.match(result.stderr, /README\.md line \d+ states €99 beside ckthsb/);
});

test("accepts README copy that puts a correct price after a comma", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const readmePath = join(fixtureRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  // Negative control, and a real bug this caught: the amount reader used to
  // swallow the comma and reject "€6," — correct copy failing a guard.
  await writeFile(readmePath, readme.replace("from €6 |", "from €6, up to €8 |"));

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `the verifier rejected correct README copy: ${result.stderr}`);
});

// ---------------------------------------------------------------------------
// verify-contrast.mjs had exactly one test — the shared-palette one above —
// while enforcing seven distinct guard families over 894 comparisons. The three
// covered here are the load-bearing ones: the reference check that validates
// the contrast maths itself, and the per-theme floors for both shipped packs.
//
// The reference check matters most. It compares contrast() against three known
// WCAG values, so if the maths broke, all 894 comparisons would still "pass"
// and every accessibility claim on the storefront would be false. Nothing
// tested the thing that makes the other 894 mean anything.
// ---------------------------------------------------------------------------

test("rejects a broken contrast calculation against known WCAG values", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const verifierPath = join(fixtureRoot, "scripts/verify-contrast.mjs");
  const source = await readFile(verifierPath, "utf8");
  // Make every pair report perfect contrast. Without the reference check this
  // passes 894 comparisons while measuring nothing.
  await writeFile(
    verifierPath,
    source.replace("function contrast(first, second) {", "function contrast(first, second) {\n  return 21;"),
  );

  const result = await runContrastVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a contrast function that always returns 21 was accepted");
  assert.match(result.stderr, /Contrast reference failed for #777777 on #FFFFFF/);
});

test("rejects a root theme whose text drops below its contrast floor", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const themePath = join(fixtureRoot, "absinthe.json");
  const theme = JSON.parse(await readFile(themePath, "utf8"));
  theme.overrides.text = "#111111";
  await writeFile(themePath, `${JSON.stringify(theme, null, 2)}\n`);

  const result = await runContrastVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an unreadable root theme was accepted");
  assert.match(result.stderr, /Absinthe: text on terminal is [\d.]+:1; needs 7\.0:1/);
});

test("rejects a Vol. 2 theme whose text drops below its contrast floor", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const themePath = join(fixtureRoot, "plugins/dark-themes-vol-2/themes/afterglow.json");
  const theme = JSON.parse(await readFile(themePath, "utf8"));
  theme.overrides.text = "#111111";
  await writeFile(themePath, `${JSON.stringify(theme, null, 2)}\n`);

  const result = await runContrastVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an unreadable Vol. 2 theme was accepted");
  assert.match(result.stderr, /Afterglow: text on terminal is [\d.]+:1; needs 7\.0:1/);
});

// The four remaining verify-contrast guard families. Lower stakes than the
// reference maths and the theme floors, but the same class of exposure: each
// could be deleted and the suite would stay green.
//
// Note on fixtures: the verifier finds the gallery with a regex that requires a
// newline before the closing bracket, so re-serialising the THEMES array onto
// one line makes it unfindable. A first attempt at the last two tests did
// exactly that, and they "failed" for a missing gallery rather than for the
// guard under test — a test passing for the wrong reason. Both now edit one row
// in place and leave the formatting alone.

test("rejects a storefront faint colour that is unreadable on the page canvas", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const page = join(fixtureRoot, "index.html");
  const html = await readFile(page, "utf8");
  await writeFile(page, html.replace("--faint:#858991", "--faint:#0a0a0a"));

  const result = await runContrastVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an unreadable --faint was accepted");
  assert.match(result.stderr, /Storefront: --faint on --ground is [\d.]+:1; needs 4\.5:1/);
});

test("rejects a semantic syntax colour that is unreadable as body text", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const page = join(fixtureRoot, "index.html");
  const html = await readFile(page, "utf8");
  await writeFile(page, html.replace("--syntax-blue:#8eaadf", "--syntax-blue:#0b0b0b"));

  const result = await runContrastVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an unreadable semantic token was accepted");
  assert.match(result.stderr, /Storefront: --syntax-blue on --terminal-surface is [\d.]+:1; needs 4\.5:1/);
});

test("rejects two gallery cards sharing a display name", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const page = join(fixtureRoot, "index.html");
  const html = await readFile(page, "utf8");
  // A duplicate name silently collapses the by-name lookup, so one theme's
  // colours would never be compared against its gallery card at all.
  await writeFile(page, html.replace('["Acid",', '["Absinthe",'));

  const result = await runContrastVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a duplicated gallery display name was accepted");
  assert.match(result.stderr, /Gallery display names must be unique/);
});

test("rejects a gallery swatch that disagrees with its theme file", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const page = join(fixtureRoot, "index.html");
  const html = await readFile(page, "utf8");
  // The gallery is what a buyer sees; the theme file is what installs. A
  // divergence means the preview is advertising a colour nobody receives.
  await writeFile(page, html.replace('["Absinthe","#C0D648"', '["Absinthe","#123456"'));

  const result = await runContrastVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a gallery swatch diverging from its theme was accepted");
  assert.match(result.stderr, /absinthe\.json: gallery claude #123456 does not match theme #C0D648/);
});

test("rejects a themes.json generator that publishes a partial palette", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const generator = join(fixtureRoot, "scripts/build-theme-index.mjs");
  const source = await readFile(generator, "utf8");
  // The byte comparison against themes.json cannot catch this, because the
  // documented workflow regenerates the file from the same broken code and the
  // two then agree. Before verify checked the index against the theme files,
  // this exact mutation left themes.json publishing a one-key palette with
  // build, verify and verify-contrast all exiting 0.
  await writeFile(
    generator,
    source.replace(
      'const SUMMARY_ROLES = ["claude", "claudeShimmer", "text", "inactive"];',
      'const SUMMARY_ROLES = ["inactive", "inactive", "inactive", "inactive"];',
    ),
  );
  const regenerate = await runNodeScript(fixtureRoot, "scripts/build-theme-index.mjs");
  assert.equal(regenerate.code, 0, "the generator itself should still run");

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a gutted theme index shipped green");
  assert.match(result.stderr, /themes\.json publishes palette roles \[inactive\]/);
});

test("rejects a themes.json entry whose colour disagrees with its theme file", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const generator = join(fixtureRoot, "scripts/build-theme-index.mjs");
  const source = await readFile(generator, "utf8");
  await writeFile(
    generator,
    source.replace(
      "if (theme.overrides[role]) palette[role] = theme.overrides[role];",
      'if (theme.overrides[role]) palette[role] = role === "text" ? "#000000" : theme.overrides[role];',
    ),
  );
  await runNodeScript(fixtureRoot, "scripts/build-theme-index.mjs");

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a published colour that does not ship was accepted");
  assert.match(result.stderr, /themes\.json gives absinthe\.text as #000000 but absinthe\.json says #EBEDE8/);
});

test("rejects a skill whose supporting files were not packaged", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // A skill may carry references, scripts or assets beside SKILL.md. The sync
  // used to copy only SKILL.md and the check used to read only SKILL.md, so a
  // supporting file was silently never packaged and the build stayed green —
  // shipping an installer a skill pointing at a file that is not there.
  const references = join(fixtureRoot, ".claude/skills/freelance-admin-de/references");
  await mkdir(references, { recursive: true });
  await writeFile(join(references, "kleinunternehmer.md"), "# reference\n");

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an unpackaged supporting file shipped green");
  assert.match(result.stderr, /packages \[SKILL\.md\] but its source has \[SKILL\.md, references\/kleinunternehmer\.md\]/);
});

test("packages a skill's supporting files and detects tampering in them", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const references = join(fixtureRoot, ".claude/skills/freelance-admin-de/references");
  await mkdir(references, { recursive: true });
  await writeFile(join(references, "kleinunternehmer.md"), "# reference\n");

  const synced = await runNodeScript(fixtureRoot, "scripts/sync-plugin-skills.mjs");
  assert.equal(synced.code, 0, "the sync should succeed");

  // Negative control first: once synced, the same state must be accepted.
  const afterSync = await runVerifier(fixtureRoot);
  assert.equal(afterSync.code, 0, `a correctly synced skill was rejected: ${afterSync.stderr}`);

  // Then the packaged copy is tampered with, which must not survive.
  await writeFile(
    join(fixtureRoot, "plugins/berlin-studio-skills/skills/freelance-admin-de/references/kleinunternehmer.md"),
    "# tampered\n",
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a tampered supporting file was accepted");
  assert.match(result.stderr, /freelance-admin-de\/references\/kleinunternehmer\.md differs from its plugin copy/);
});
