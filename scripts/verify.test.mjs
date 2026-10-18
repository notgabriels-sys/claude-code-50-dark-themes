import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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

test("rejects a marketplace listing that disagrees with the plugin's own manifest", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // Every plugin's metadata is written twice — plugin.json and the marketplace
  // entry — and only name, source and version used to be compared. Found live:
  // the skills plugin listed six keywords in the marketplace and eight in its
  // manifest, and verify was green.
  const marketplacePath = join(fixtureRoot, ".claude-plugin/marketplace.json");
  const marketplace = JSON.parse(await readFile(marketplacePath, "utf8"));
  const entry = marketplace.plugins.find((plugin) => plugin.name === "berlin-studio-skills");
  entry.keywords = entry.keywords.slice(0, -1);
  await writeFile(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a marketplace listing that drifted from its manifest shipped green");
  assert.match(result.stderr, /Marketplace entry for berlin-studio-skills disagrees with its plugin manifest on keywords/);
});

test("rejects a plugin whose description still states yesterday's count", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // A count written in prose rots the day the next thing is added. Found live:
  // both the manifest and the listing said "Five skills" while six shipped.
  // Here a seventh skill is added and packaged correctly, and nothing else
  // changes — the only defect is the number in the description.
  const seventh = join(fixtureRoot, ".claude/skills/zz-seventh");
  await cp(join(fixtureRoot, ".claude/skills/release-delivery"), seventh, { recursive: true });
  const skillPath = join(seventh, "SKILL.md");
  await writeFile(skillPath, (await readFile(skillPath, "utf8")).replace(/^name: .*$/m, "name: zz-seventh"));
  const synced = await runNodeScript(fixtureRoot, "scripts/sync-plugin-skills.mjs");
  assert.equal(synced.code, 0, "the sync should succeed");

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a stale count in the plugin description shipped green");
  assert.match(result.stderr, /berlin-studio-skills describes itself as shipping \d+ but \d+ ship/);
});

test("rejects a public page whose prose theme count drifts from what ships", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // The Vol. 2 count is written as a word on the storefront, the install
  // guide, llms.txt and the READMEs, and the description guard reads only the
  // plugin descriptions. When the pack grows, the description is forced to
  // move and the prose is not — the "Five skills" rot in another place.
  const readmePath = join(fixtureRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  assert.equal(readme.split("twelve all-new palettes").length, 2, "fixture anchor must be unique");
  await writeFile(readmePath, readme.replace("twelve all-new palettes", "eleven all-new palettes"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a stale prose theme count shipped green");
  assert.match(result.stderr, /README\.md says "eleven all-new palettes" but the packs ship \d+ \+ \d+ themes/);
});

test("accepts an edition number, a foreign product's count, a count bound to a later number and a hyphenated total", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // Negative control: "Vol. 3 themes" is an edition, not three themes;
  // "70 VS Code themes" is another product; in "one of my 50 themes" the
  // count bound to "themes" is 50, not one; and "sixty-two themes" is the
  // shipped total, which a bare-word table once read as "two themes". None
  // may fire.
  const readmePath = join(fixtureRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  await writeFile(
    readmePath,
    readme.replace(
      "twelve all-new palettes",
      "twelve all-new palettes (no Vol. 3 themes are planned; Lowlight has 70 VS Code themes; one of my 50 themes; sixty-two themes in all)",
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a legitimate sentence was rejected: ${result.stderr}`);
});

test("rejects a hyphenated prose count as the whole word, not its last half", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // "sixty-three" must be read as 63 and reported as "sixty-three palettes".
  // Before the hyphen was understood the scan read it as "three palettes" —
  // a failure for the wrong reason, which also meant a correct "sixty-two"
  // failed and "Twenty-six skills" in the README passed unread.
  const readmePath = join(fixtureRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  assert.equal(readme.split("twelve all-new palettes").length, 2, "fixture anchor must be unique");
  await writeFile(readmePath, readme.replace("twelve all-new palettes", "sixty-three palettes"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a wrong hyphenated count shipped green");
  assert.match(result.stderr, /README\.md says "sixty-three palettes" but the packs ship/);
});

test("rejects a hyphenated skills count in the README", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const readmePath = join(fixtureRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  assert.equal(readme.split("Six skills for running").length, 2, "fixture anchor must be unique");
  await writeFile(readmePath, readme.replace("Six skills for running", "Twenty-six skills for running"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a hyphenated skills count passed unread");
  assert.match(result.stderr, /README\.md says "Twenty-six skills" but \d+ skills ship/);
});

// A plugin directory ships whole. `claude plugin install` copies every file in
// it and Claude Code loads any hooks, commands, skills, agents or MCP servers it
// finds at the root or that a manifest or listing declares inline. These tests
// pin the allowlists in verify.mjs that keep a theme pack shipping themes only.

async function editJson(path, edit) {
  const value = JSON.parse(await readFile(path, "utf8"));
  edit(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

test("rejects a hook dropped into a theme plugin's root", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // Reproduced against the real installer: this file made a SessionStart hook
  // run for everyone who installed 50-dark-themes, with verify green.
  const hooks = join(fixtureRoot, "plugins/50-dark-themes/hooks");
  await mkdir(hooks);
  await writeFile(
    join(hooks, "hooks.json"),
    JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo stray" }] }] } }),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a hook shipped inside a theme plugin");
  assert.match(result.stderr, /plugins\/50-dark-themes\/hooks\/hooks\.json is not part of the 50-dark-themes package/);
});

test("rejects a component declared inline in a marketplace entry", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // No new file at all: the listing alone can declare an MCP server, and the
  // manifest-agreement check only ever iterated the manifest's keys.
  await editJson(join(fixtureRoot, ".claude-plugin/marketplace.json"), (marketplace) => {
    const entry = marketplace.plugins.find((plugin) => plugin.name === "dark-themes-vol-2");
    assert.equal(entry.mcpServers, undefined, "fixture must add the key, not find it");
    entry.mcpServers = { stray: { command: "/bin/true" } };
  });

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an inline MCP server in a listing shipped green");
  assert.match(result.stderr, /marketplace entry for dark-themes-vol-2 declares "mcpServers"/);
});

test("rejects a theme plugin's experimental block gaining a second component", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // The agreement check skips "experimental" and the listing never carries it,
  // so only the exact-value check sees an addition here.
  await editJson(join(fixtureRoot, "plugins/50-dark-themes/.claude-plugin/plugin.json"), (manifest) => {
    assert.deepEqual(manifest.experimental, { themes: "./themes/" });
    manifest.experimental.commands = "./commands/";
  });

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an extra experimental component shipped green");
  assert.match(result.stderr, /50-dark-themes\/\.claude-plugin\/plugin\.json must declare exactly "experimental"/);
});

test("rejects a manifest key that is not plugin metadata on the skills plugin", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // A skills plugin whose manifest was started from a theme plugin's: the
  // agreement check skips "experimental", the listing does not carry it, and
  // the skills plugin is not a theme plugin, so only the manifest allowlist
  // stands between it and installers.
  await editJson(join(fixtureRoot, "plugins/berlin-studio-skills/.claude-plugin/plugin.json"), (manifest) => {
    assert.equal(manifest.experimental, undefined, "fixture must add the key, not find it");
    manifest.experimental = { themes: "./themes/" };
  });

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a non-metadata manifest key shipped green");
  assert.match(result.stderr, /berlin-studio-skills\/\.claude-plugin\/plugin\.json declares "experimental"/);
});

test("rejects a symlink inside a plugin package", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // At an allowed path, so only the symlink branch can catch it: the file
  // allowlist and the presence check both accept a LICENSE entry.
  const license = join(fixtureRoot, "plugins/berlin-studio-skills/LICENSE");
  await rm(license);
  await symlink("../../LICENSE", license);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a symlink in a plugin package shipped green");
  assert.match(result.stderr, /plugins\/berlin-studio-skills\/LICENSE is a symlink/);
});

test("rejects a directory under plugins/ that is not a registered plugin", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await mkdir(join(fixtureRoot, "plugins/rogue"));
  await mkdir(join(fixtureRoot, "plugins/rogue/.claude-plugin"));
  await writeFile(join(fixtureRoot, "plugins/rogue/.claude-plugin/plugin.json"), "{}\n");

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an unregistered plugin directory shipped green");
  assert.match(result.stderr, /plugins\/rogue is not one of the registered plugins/);
});

test("rejects a finder scoped to a single theme grid", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureHtml = join(fixtureRoot, "index.html");
  const html = await readFile(fixtureHtml, "utf8");
  await writeFile(
    fixtureHtml,
    html.replace('document.querySelectorAll(".card[data-search]")', 'grid.querySelectorAll(".card")'),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a finder that cannot reach every theme on the page");
  assert.match(result.stderr, /scopes the finder to one grid/);
});

test("rejects a finder whose document-wide selector was removed", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureHtml = join(fixtureRoot, "index.html");
  const html = await readFile(fixtureHtml, "utf8");
  await writeFile(
    fixtureHtml,
    html.replace('document.querySelectorAll(".card[data-search]")', 'document.querySelectorAll(".card")'),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a page where the finder guard had gone inert");
  assert.match(result.stderr, /no longer selects finder cards document-wide/);
});

test("rejects an installer the README cannot run", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await chmod(join(fixtureRoot, "install.sh"), 0o644);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a non-executable install.sh");
  assert.match(result.stderr, /install\.sh is not executable/);
});

test("rejects installer help built from a fixed line range", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureInstaller = join(fixtureRoot, "install.sh");
  const installer = await readFile(fixtureInstaller, "utf8");
  await writeFile(
    fixtureInstaller,
    installer.replace(
      /(-h\|--help\)\s*)awk[^\n]*/,
      "$1sed -n '2,12p' \"${BASH_SOURCE[0]}\"; exit 0 ;;",
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a --help that drifts with the header");
  assert.match(result.stderr, /fixed line range/);
});

test("rejects an installer that claims --uninstall knows what it installed", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureInstaller = join(fixtureRoot, "install.sh");
  const installer = await readFile(fixtureInstaller, "utf8");
  await writeFile(
    fixtureInstaller,
    installer.replace(
      /remove every theme in the pack from the themes dir/,
      "remove the ones this script installed",
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a --help that overstates what --uninstall tracks");
  assert.match(result.stderr, /removes only what the script installed/);
});

test("rejects an installer whose help drops the filename-matching warning", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureInstaller = join(fixtureRoot, "install.sh");
  const installer = await readFile(fixtureInstaller, "utf8");
  await writeFile(
    fixtureInstaller,
    installer.replace(/^# --uninstall matches by filename[\s\S]*?Backups are never touched\.\n/m, ""),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a destructive flag documented without its caveat");
  assert.match(result.stderr, /matches by filename, not contents/);
});

test("rejects a manual install route that never says where the files come from", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureGuide = join(fixtureRoot, "claude-code-theme-install-guide.html");
  const guide = await readFile(fixtureGuide, "utf8");
  const start = guide.indexOf('<span class="syntax-command">git</span>');
  const end = guide.indexOf('<span class="syntax-command">mkdir</span>');
  await writeFile(fixtureGuide, guide.slice(0, start) + guide.slice(end));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a manual route with no way to obtain the files");
  assert.match(result.stderr, /never says how to obtain the theme files/);
});

test("rejects a manual install route that silently skips Vol. 2", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureGuide = join(fixtureRoot, "claude-code-theme-install-guide.html");
  const guide = await readFile(fixtureGuide, "utf8");
  await writeFile(fixtureGuide, guide.replaceAll("plugins/dark-themes-vol-2/themes/*.json", "*.json"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a manual route covering only the flagship pack");
  assert.match(result.stderr, /silently\s+skips Vol\. 2/);
});

test("rejects a guide whose manual section was removed entirely", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureGuide = join(fixtureRoot, "claude-code-theme-install-guide.html");
  const guide = await readFile(fixtureGuide, "utf8");
  await writeFile(fixtureGuide, guide.replace(/<section[^>]*id="manual"[\s\S]*?<\/section>/, ""));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a guide with no manual section, leaving the guard inert");
  assert.match(result.stderr, /has no #manual section/);
});

test("rejects a DEV draft that advertises the unpublished Workflow Kit", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const draftPath = join(fixtureRoot, "DEV_COMMUNITY_ARTICLE_DRAFT.md");
  const draft = await readFile(draftPath, "utf8");
  await writeFile(draftPath, draft.replace("cheat sheets, palettes", "cheat sheets, workflow packs, palettes"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted copy advertising a product nobody can buy");
  assert.match(result.stderr, /DEV_COMMUNITY_ARTICLE_DRAFT\.md advertises the Workflow Kit/);
});

test("rejects paste-ready promotion copy that advertises the unpublished Workflow Kit", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const queuePath = join(fixtureRoot, "PROMOTION_QUEUE.md");
  const queue = await readFile(queuePath, "utf8");
  // The prose already names the kit to explain why it is held back; only a fenced
  // block — the copy someone would paste — may trip the guard.
  await writeFile(queuePath, queue.replace("```text\n", "```text\nIncludes the Claude Code Workflow Kit.\n"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted paste-ready copy advertising an unpublished product");
  assert.match(result.stderr, /PROMOTION_QUEUE\.md paste-ready copy advertises the Workflow Kit/);
});

test("rejects an empty directory in a plugin, the shape a git submodule takes in CI", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // Reproduced by the guard's review: CI's checkout leaves a submodule empty,
  // Claude Code's marketplace clone fetches it, and the installed theme pack
  // reported "Hooks (1) SessionStart" while verify was green.
  await mkdir(join(fixtureRoot, "plugins/50-dark-themes/hooks"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an empty directory where a submodule would sit shipped green");
  assert.match(result.stderr, /plugins\/50-dark-themes\/hooks is an empty directory/);
});

test("rejects a .gitmodules file", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const gitmodules = join(fixtureRoot, ".gitmodules");
  await assert.rejects(lstat(gitmodules), "fixture must add .gitmodules, not find it");
  await writeFile(
    gitmodules,
    '[submodule "hooks"]\n\tpath = plugins/50-dark-themes/hooks\n\turl = https://example.invalid/hooks.git\n',
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a submodule declaration shipped green");
  assert.match(result.stderr, /\.gitmodules exists/);
});

test("rejects a plugin missing a file it should ship", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await rm(join(fixtureRoot, "plugins/berlin-studio-skills/LICENSE"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a plugin without its LICENSE shipped green");
  assert.match(result.stderr, /plugins\/berlin-studio-skills\/LICENSE is missing from the berlin-studio-skills package/);
});

test("packages a relative symlink in a source skill as a real file", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // Negative control for the sync. fs.cp used to rewrite a relative link into
  // an absolute one pointing into the contributor's checkout; the sync now
  // dereferences, so the package holds a copy and verify accepts it.
  await symlink("../release-delivery/SKILL.md", join(fixtureRoot, ".claude/skills/freelance-admin-de/shared.md"));
  const synced = await runNodeScript(fixtureRoot, "scripts/sync-plugin-skills.mjs");
  assert.equal(synced.code, 0, "the sync should succeed");
  const packaged = await lstat(join(fixtureRoot, "plugins/berlin-studio-skills/skills/freelance-admin-de/shared.md"));
  assert.equal(packaged.isSymbolicLink(), false, "the sync packaged a symlink");

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a correctly synced skill was rejected: ${result.stderr}`);
});

// The crawlable ItemList is regenerated by the same function verify used to
// compare it against, so a generator bug regenerated into a block that agreed
// with itself. Each row mutates the generator, regenerates, and expects the
// independent content check to name the defect.
async function regenerateWithMutatedGenerator(t, from, to) {
  const fixtureRoot = await makeFixture(t);
  const generatorPath = join(fixtureRoot, "scripts/build-theme-index.mjs");
  const generator = await readFile(generatorPath, "utf8");
  assert.equal(generator.split(from).length, 2, `generator anchor must occur exactly once: ${from}`);
  await writeFile(generatorPath, generator.replace(from, () => to));
  const built = await runNodeScript(fixtureRoot, "scripts/build-theme-index.mjs");
  assert.equal(built.code, 0, `the mutated generator should still build: ${built.stderr}`);
  return fixtureRoot;
}

for (const [defect, from, to, message] of [
  ["drops a theme", "itemListElement: index.themes.map(", "itemListElement: index.themes.slice(0, -1).map(",
    /numberOfItems \d+ and lists \d+; \d+ theme files ship/],
  ["numbers positions from 0", "position: position + 1,", "position: position,",
    /element 1 has position 0/],
  ["links dead anchors", "url: theme.url,", "url: theme.url.replace(\"#theme-\", \"#\"),",
    /element 1 \("Absinthe"\) links "https:\/\/gabs-utilities\.com\/#absinthe"/],
  ["names items by file id", "name: theme.name,\n      url: theme.url,", "name: theme.id,\n      url: theme.url,",
    /element 1 is named "absinthe"; theme file absinthe\.json is "Absinthe"/],
  ["types its items as Thing", '"@type": "ListItem",', '"@type": "Thing",',
    /element 1 is a "Thing", not a ListItem/],
  ["stops typing the list as an ItemList", '"@type": "ItemList",', '"@type": "List",',
    /index\.html mentions the ItemList type 0 time\(s\) in its parsed JSON-LD/],
  ["drops the schema.org context", '"@context": "https://schema.org",\n    "@type": "ItemList",', '"@type": "ItemList",',
    /ItemList's @context is undefined/],
  ["renames the list", "    name: index.name,\n    numberOfItems", '    name: "Dark Themes",\n    numberOfItems',
    /ItemList is named "Dark Themes"; the plugin it lists is/],
  // Found by reviewing the first version of the content check: generator bugs
  // that ADD a key, or change a value's shape, still agreed with themselves.
  ["gives the list its own url", "    numberOfItems: index.count,", '    url: "https://example.invalid/",\n    numberOfItems: index.count,',
    /The theme ItemList carries keys \[.*"url"\]; it may carry exactly/],
  ["points each item at another product", "      url: theme.url,\n    })),",
    '      url: theme.url,\n      item: { "@type": "SoftwareApplication", name: "Dracula Pro" },\n    })),',
    /element 1 carries keys \[.*"item".*\]; a ListItem here may carry exactly/],
  ["types the list as an array", '"@type": "ItemList",', '"@type": ["ItemList", "BreadcrumbList"],',
    /ItemList's @type is \["ItemList","BreadcrumbList"\], not "ItemList"/],
  ["emits a duplicate key", "JSON.stringify(itemList)}</script>", "JSON.stringify(itemList).replace(\"{\", '{\"numberOfItems\":1,')}</script>",
    /not exactly the compact JSON its own parse produces/],
  ["wraps the list in an array", "JSON.stringify(itemList)}</script>", "JSON.stringify([itemList])}</script>",
    /must hold the ItemList object itself/],
  ["sorts the list by display name", "itemListElement: index.themes.map(",
    "itemListElement: [...index.themes].sort((a, b) => (a.name < b.name ? -1 : 1)).map(",
    /names every theme, but not in theme-file order/],
  ["emits a null element", "index.themes.map((theme, position) => ({", "index.themes.map((theme, position) => position === 0 ? null : ({",
    /element 1 is null, not a ListItem object/],
  ["emits relative urls", "      url: theme.url,\n    })),", '      url: "#theme-" + theme.id,\n    })),',
    /element 1 \("Absinthe"\) has url "#theme-absinthe", which is not an absolute URL/],
  ["emits a second JSON-LD block inside the markers", "JSON.stringify(itemList)}</script>",
    'JSON.stringify(itemList)}</script>\\n<script type="application/ld+json">{"@type":"WebSite"}</script>',
    /The theme-itemlist markers must hold exactly one JSON-LD block, the theme ItemList/],
]) {
  test(`rejects a theme ItemList generator that ${defect}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await regenerateWithMutatedGenerator(t, from, to);

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `a generator that ${defect} shipped green`);
    assert.match(result.stderr, message);
  });
}

test("rejects a stale second ItemList block that survives regeneration", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // As a merge that kept both sides would leave it. The generator rewrites the
  // first marker pair only, so regenerating does not remove the stale copy.
  const htmlPath = join(fixtureRoot, "index.html");
  const html = await readFile(htmlPath, "utf8");
  const start = "<!-- theme-itemlist:generated by scripts/build-theme-index.mjs, do not edit -->";
  const end = "<!-- /theme-itemlist -->";
  assert.equal(html.split(start).length, 2, "fixture anchor must be unique");
  assert.equal(html.split(end).length, 2, "fixture anchor must be unique");
  const block = html.slice(html.indexOf(start), html.indexOf(end) + end.length);
  const stale = block.replace('"numberOfItems":50', '"numberOfItems":49');
  assert.notEqual(stale, block, "the stale copy must differ from the real block");
  await writeFile(htmlPath, html.replace(block, () => `${block}\n${stale}`));
  const built = await runNodeScript(fixtureRoot, "scripts/build-theme-index.mjs");
  assert.equal(built.code, 0, "regeneration should succeed");

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a stale second ItemList block shipped green");
  assert.match(result.stderr, /exactly one theme-itemlist marker pair, start before end; found 2 start and 2 end/);
});

test("rejects an unmarked extra ItemList", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const htmlPath = join(fixtureRoot, "index.html");
  const html = await readFile(htmlPath, "utf8");
  const end = "<!-- /theme-itemlist -->";
  assert.equal(html.split(end).length, 2, "fixture anchor must be unique");
  const extra =
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList",' +
    '"numberOfItems":1,"itemListElement":[]}</script>';
  await writeFile(htmlPath, html.replace(end, () => `${end}\n${extra}`));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a second, unmarked ItemList shipped green");
  assert.match(result.stderr, /index\.html mentions the ItemList type 2 time\(s\) in its parsed JSON-LD and 2 time\(s\) in its text/);
});

test("accepts other JSON-LD beside the theme ItemList", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // Negative control: a BreadcrumbList carries ListItems too, but it is not an
  // ItemList and must not be counted as a second one.
  const htmlPath = join(fixtureRoot, "index.html");
  const html = await readFile(htmlPath, "utf8");
  const end = "<!-- /theme-itemlist -->";
  assert.equal(html.split(end).length, 2, "fixture anchor must be unique");
  const breadcrumbs =
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList",' +
    '"itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://gabs-utilities.com/"}]}</script>';
  await writeFile(htmlPath, html.replace(end, () => `${end}\n${breadcrumbs}`));

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `legitimate extra JSON-LD was rejected: ${result.stderr}`);
});

// The page around the list. Each of these left a crawler reading a wrong list,
// or no list, while the first version of the content check stayed green.
async function editPage(t, page, from, to) {
  const fixtureRoot = await makeFixture(t);
  const pagePath = join(fixtureRoot, page);
  const markup = await readFile(pagePath, "utf8");
  assert.equal(markup.split(from).length, 2, `fixture anchor must occur exactly once in ${page}: ${from}`);
  await writeFile(pagePath, markup.replace(from, () => to));
  return fixtureRoot;
}
const markerEnd = "<!-- /theme-itemlist -->";
const markerStart = "<!-- theme-itemlist:generated by scripts/build-theme-index.mjs, do not edit -->";
const wrongList =
  '{"@context":"https://schema.org","@type":"ItemList","numberOfItems":1,"itemListElement":' +
  '[{"@type":"ListItem","position":1,"name":"Dracula","url":"https://example.invalid/dracula"}]}';
const canonicalTag = '<link rel="canonical" href="https://gabs-utilities.com/">';

for (const [defect, page, from, to, message] of [
  ["a JSON-LD script tag spelled with single quotes", "index.html", markerEnd,
    `${markerEnd}\n<script type='application/ld+json'>${wrongList}</script>`,
    /index\.html has a script tag spelled "<script type='application\/ld\+json'>"/],
  ["a script closed in capitals", "index.html", markerEnd,
    `${markerEnd}\n<script type="application/ld+json">{}</SCRIPT>`,
    /index\.html closes a script with "<\/SCRIPT>"/],
  ["the theme list wrapped in a template", "index.html", markerStart, `<template>${markerStart}`,
    /index\.html uses <template>/],
  ["a microdata ItemList", "index.html", "</body>",
    '<div itemscope itemtype="https://schema.org/ItemList" hidden><span itemprop="name">Dracula</span></div>\n</body>',
    /index\.html carries microdata or RDFa/],
  ["an ItemList typed as an IRI", "index.html", markerEnd,
    `${markerEnd}\n<script type="application/ld+json">${wrongList.replace('"@type":"ItemList"', '"@type":"https://schema.org/ItemList"')}</script>`,
    /index\.html mentions the ItemList type 2 time\(s\) in its parsed JSON-LD/],
  ["an ItemList typed through a JSON escape", "index.html", markerEnd,
    `${markerEnd}\n<script type="application/ld+json">${wrongList.replace('"@type":"ItemList"', '"@type":"Item\\u004cist"')}</script>`,
    /index\.html mentions the ItemList type 2 time\(s\) in its parsed JSON-LD and 1 time\(s\) in its text/],
  ["an ItemList on another public page", "claude-code-theme-install-guide.html", "</head>",
    `<script type="application/ld+json">${wrongList}</script>\n</head>`,
    /claude-code-theme-install-guide\.html mentions the ItemList type 1 time\(s\)/],
  ["an ItemList hidden behind a duplicate @type key", "index.html", markerEnd,
    `${markerEnd}\n<script type="application/ld+json">${wrongList.slice(0, -1)},"@type":"WebPage"}</script>`,
    /index\.html mentions the ItemList type 1 time\(s\) in its parsed JSON-LD and 2 time\(s\) in its text/],
  ["two canonical links", "index.html", canonicalTag, `${canonicalTag}\n${canonicalTag}`,
    /index\.html must carry exactly one canonical link; found 2/],
  ["a canonical link with no usable href", "index.html", canonicalTag, '<link rel="canonical" href="">',
    /index\.html's canonical link has no usable href/],
]) {
  test(`rejects ${defect}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await editPage(t, page, from, to);

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `${defect} shipped green`);
    assert.match(result.stderr, message);
  });
}

test("rejects a theme ItemList nested in the storefront graph", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // hasPart is how crawlers normally read a sub-entity; the first version
  // walked only @graph and arrays, so it never counted this list.
  const htmlPath = join(fixtureRoot, "index.html");
  const html = await readFile(htmlPath, "utf8");
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const graph = JSON.parse(block[1]);
  const software = graph["@graph"].find((node) => node["@type"] === "SoftwareApplication");
  assert.ok(software, "fixture needs the storefront SoftwareApplication node");
  software.hasPart = JSON.parse(wrongList);
  await writeFile(htmlPath, html.replace(block[1], () => JSON.stringify(graph, null, 2)));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a nested ItemList shipped green");
  assert.match(result.stderr, /index\.html mentions the ItemList type 2 time\(s\) in its parsed JSON-LD/);
});

test("rejects a style left open over the theme ItemList", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // One moved </style> turns the block into stylesheet text: crawlers read no
  // list at all, and the byte comparison still finds the text.
  const htmlPath = join(fixtureRoot, "index.html");
  const html = await readFile(htmlPath, "utf8");
  const start = html.indexOf(markerStart);
  const closing = html.lastIndexOf("</style>", start);
  assert.equal(html.slice(closing, start).trim(), "</style>", "fixture expects </style> right before the list");
  const unclosed = html.slice(0, closing) + html.slice(closing + "</style>".length);
  assert.equal(unclosed.split(markerEnd).length, 2, "fixture anchor must be unique");
  await writeFile(htmlPath, unclosed.replace(markerEnd, () => `${markerEnd}\n</style>`));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a list swallowed by a style element shipped green");
  assert.match(result.stderr, /A <style> is still open where the theme ItemList starts/);
});

test("rejects a canonical link and generator moved to a lookalike domain together", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await regenerateWithMutatedGenerator(
    t, 'const SITE = "https://gabs-utilities.com";', 'const SITE = "https://gabs-utilites.com";',
  );
  // Changed together, every deep link agreed with the canonical link; neither
  // was tied to the domain the site is actually served from.
  const htmlPath = join(fixtureRoot, "index.html");
  const html = await readFile(htmlPath, "utf8");
  assert.equal(html.split(canonicalTag).length, 2, "fixture anchor must be unique");
  await writeFile(htmlPath, html.replace(canonicalTag, '<link rel="canonical" href="https://gabs-utilites.com/">'));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a lookalike domain shipped green");
  assert.match(result.stderr, /canonical link is https:\/\/gabs-utilites\.com\/, but CNAME serves the site at https:\/\/gabs-utilities\.com\//);
});

for (const [spelling, tag] of [
  ["self-closing with its attributes reordered", '<link href="https://gabs-utilities.com/" rel="canonical" />'],
  ["without a trailing slash", '<link rel="canonical" href="https://gabs-utilities.com">'],
]) {
  test(`accepts a canonical link written ${spelling}`, { timeout: 90_000 }, async (t) => {
    // Negative control: the first version read the canonical link with an
    // exact-markup regex and rejected these equivalent spellings.
    const fixtureRoot = await editPage(t, "index.html", canonicalTag, tag);

    const result = await runVerifier(fixtureRoot);

    assert.equal(result.code, 0, `an equivalent canonical link was rejected: ${result.stderr}`);
  });
}
