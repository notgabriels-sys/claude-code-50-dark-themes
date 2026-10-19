import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
// verify reads a fixture as a plain tree, since it has no .git, so a fixture
// holds only what git would commit: a sample pack a product's generator wrote
// (ignored) must not turn the suite red, as it does not turn verify red.
let ignoredPaths = [];
try {
  ignoredPaths = execFileSync("git", ["ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--directory"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).split("\0").filter(Boolean).map((path) => path.replace(/\/$/, ""));
} catch {
  ignoredPaths = [];
}
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
      const path = pathFromRoot.split(sep).join("/");
      const isIgnored = ignoredPaths.some((ignored) => path === ignored || path.startsWith(`${ignored}/`));
      return !isExcludedDirectory && !isIgnored;
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
  assert.match(result.stderr, /assets\/social-preview\.html:\d+ claims 726 role-aware checks/);
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
  assert.match(result.stderr, /index\.html:\d+ claims 900 role-aware checks/);
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

// A name from disk reaches the URL parser as text, or a "#", "%" or "?" in it
// points at another file: each of these pages was read as index.html, so the
// price check never saw its card while the link check allowed it on a root page.
for (const name of ["index.html#2.html", "%69ndex.html", "index.html?.html"]) {
  test(`rejects a wrong price on a root page named ${name}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await makeFixture(t);
    const html = await readFile(join(fixtureRoot, "impressum.html"), "utf8");
    assert.equal(html.split("</body>").length, 2);
    const card = '<a href="https://notgabriel.gumroad.com/l/bqgfv">Dark UI Kit — €1</a>';
    await writeFile(join(fixtureRoot, name), html.replace("</body>", `${card}\n</body>`));

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `a €1 card on ${name} shipped green`);
    assert.match(result.stderr, new RegExp(`Gumroad card bqgfv on ${name.replace(/[.?]/g, "\\$&")} states €1; recordedGumroadPrices says €8`));
  });
}

test("rejects a README price that drifts from the recorded one", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const readmePath = join(fixtureRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  await writeFile(readmePath, readme.replace("· €12 |", "· €99 |"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a stale README price shipped green");
  assert.match(result.stderr, /README\.md line \d+ states €99 beside ckthsb/);
});

test("accepts README copy that puts a recorded price after a comma", { timeout: 90_000 }, async (t) => {
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

// The syncs, the index generator and the contrast check take names from disk.
// Passed to the URL parser raw, a "#" cut a name short and a "%2e%2e" segment
// read as "..": the skills sync then deleted the whole plugin directory.
test("removes a stale packaged skill named %2e%2e without leaving its directory", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const stale = join(fixtureRoot, "plugins/berlin-studio-skills/skills/%2e%2e");
  await mkdir(stale, { recursive: true });
  await writeFile(join(stale, "x"), "stale\n");

  const synced = await runNodeScript(fixtureRoot, "scripts/sync-plugin-skills.mjs");

  assert.equal(synced.code, 0, `the sync failed: ${synced.stderr}`);
  await lstat(join(fixtureRoot, "plugins/berlin-studio-skills/LICENSE"));
  await assert.rejects(lstat(stale), "the stale directory survived the sync");
});

test("syncs and removes theme files whose names hold a \"#\"", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const ember = JSON.parse(await readFile(join(fixtureRoot, "ember.json"), "utf8"));
  const odd = `${JSON.stringify({ ...ember, name: "Hash Name" }, null, 2)}\n`;
  await writeFile(join(fixtureRoot, "ember.json#x.json"), odd);
  await writeFile(join(fixtureRoot, "plugins/50-dark-themes/themes/stale#.json"), "{}\n");

  const synced = await runNodeScript(fixtureRoot, "scripts/sync-plugin-themes.mjs");

  assert.equal(synced.code, 0, `the sync failed: ${synced.stderr}`);
  assert.equal(await readFile(join(fixtureRoot, "plugins/50-dark-themes/themes/ember.json#x.json"), "utf8"), odd);
  await assert.rejects(lstat(join(fixtureRoot, "plugins/50-dark-themes/themes/stale#.json")));
});

test("indexes and contrast-checks a theme file whose name holds a \"#\"", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const ember = JSON.parse(await readFile(join(fixtureRoot, "ember.json"), "utf8"));
  await writeFile(join(fixtureRoot, "ember.json#x.json"), `${JSON.stringify({ ...ember, name: "Hash Name" }, null, 2)}\n`);

  const built = await runNodeScript(fixtureRoot, "scripts/build-theme-index.mjs");
  assert.equal(built.code, 0, `the generator failed: ${built.stderr}`);
  const index = JSON.parse(await readFile(join(fixtureRoot, "themes.json"), "utf8"));
  assert.equal(index.themes.find((theme) => theme.id === "ember.json#x")?.name, "Hash Name");

  const contrast = await runContrastVerifier(fixtureRoot);

  assert.notEqual(contrast.code, 0);
  assert.match(contrast.stderr, /ember\.json#x\.json: missing gallery row/);
});

test("contrast-checks a Vol. 2 theme file whose name holds a \"#\"", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const themes = join(fixtureRoot, "plugins/dark-themes-vol-2/themes");
  const [first] = (await readdir(themes)).filter((file) => file.endsWith(".json")).sort();
  const theme = JSON.parse(await readFile(join(themes, first), "utf8"));
  await writeFile(join(themes, `${first}#x.json`), `${JSON.stringify({ ...theme, name: "Hash Name" }, null, 2)}\n`);

  const contrast = await runContrastVerifier(fixtureRoot);

  assert.notEqual(contrast.code, 0);
  assert.match(contrast.stderr, new RegExp(`dark-themes-vol-2/${first.replace(".", "\\.")}#x\\.json: missing preview terminal colour`));
});

test("packages a source skill whose directory name holds a \"#\"", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const skill = join(fixtureRoot, ".claude/skills/hash#name");
  await mkdir(skill, { recursive: true });
  await writeFile(join(skill, "SKILL.md"), "---\nname: hash-name\ndescription: A test skill.\n---\n\n# Hash name\n");

  const synced = await runNodeScript(fixtureRoot, "scripts/sync-plugin-skills.mjs");

  assert.equal(synced.code, 0, `the sync failed: ${synced.stderr}`);
  assert.equal(
    await readFile(join(fixtureRoot, "plugins/berlin-studio-skills/skills/hash#name/SKILL.md"), "utf8"),
    await readFile(join(skill, "SKILL.md"), "utf8"),
  );
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

test("reads a skills count in a README image's alt text", { timeout: 90_000 }, async (t) => {
  // The skills scan reads the attribute text as the theme scan does.
  const fixtureRoot = await editPage(
    t,
    "README.md",
    "## Note on backgrounds",
    '<img src="preview.png" alt="Seven Berlin studio skills">\n\n## Note on backgrounds',
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a stale skills count in alt text shipped green");
  assert.match(result.stderr, /README\.md:\d+ says "Seven Berlin studio skills"/);
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
  assert.match(result.stderr, /README\.md:\d+ says "eleven all-new palettes" but the packs ship \d+ \+ \d+ themes/);
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
  assert.match(result.stderr, /README\.md:\d+ says "sixty-three palettes" but the packs ship/);
});

test("rejects a hyphenated skills count in the README", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const readmePath = join(fixtureRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  assert.equal(readme.split("Six skills for running").length, 2, "fixture anchor must be unique");
  await writeFile(readmePath, readme.replace("Six skills for running", "Twenty-six skills for running"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a hyphenated skills count passed unread");
  assert.match(result.stderr, /README\.md:\d+ says "Twenty-six skills" but \d+ skills ship/);
});

test("rejects a digit skills count in the README", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // The skills scan read number words only, so "5 skills" passed.
  const readmePath = join(fixtureRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  assert.equal(readme.split("Six skills for running").length, 2, "fixture anchor must be unique");
  await writeFile(readmePath, readme.replace("Six skills for running", "5 skills for running"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a digit skills count passed unread");
  assert.match(result.stderr, /README\.md:\d+ says "5 skills" but \d+ skills ship/);
});

test("rejects a stale theme count in any note Pages renders, at its line", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // The theme scan read five named files while nine notes stated the same
  // counts, among them the drafts in PROMOTION_QUEUE.md that get posted
  // elsewhere. Each could be edited to a wrong number with verify green.
  const notePath = join(fixtureRoot, "PROMOTION_QUEUE.md");
  const note = await readFile(notePath, "utf8");
  const anchor = "12 all-new dark themes";
  assert.equal(note.split(anchor).length, 2, "fixture anchor must be unique");
  const line = note.slice(0, note.indexOf(anchor)).split("\n").length;
  await writeFile(notePath, note.replace(anchor, "13 all-new dark themes"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a stale theme count in a served note shipped green");
  assert.match(
    result.stderr,
    new RegExp(`PROMOTION_QUEUE\\.md:${line} says "13 all-new dark themes" but the packs ship`),
  );
});

test("rejects a stale theme count written across a line break", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // llms.txt wraps "the 50" and "free Claude Code themes" onto two lines; the
  // scan matched spaces and tabs only, so the count went unread there.
  const llmsPath = join(fixtureRoot, "llms.txt");
  const llms = await readFile(llmsPath, "utf8");
  const anchor = "the 50\nfree Claude Code themes";
  assert.equal(llms.split(anchor).length, 2, "fixture anchor must be unique");
  await writeFile(llmsPath, llms.replace(anchor, "the 51\nfree Claude Code themes"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a line-wrapped stale count shipped green");
  assert.match(result.stderr, /llms\.txt:\d+ says "51 free Claude Code themes" but the packs ship/);
});

test("rejects a stale theme count however Markdown or HTML spells it", { timeout: 300_000 }, async (t) => {
  // Each renders as "thirteen all-new palettes", and each passed while the
  // scan read the raw text.
  for (const spelling of [
    "**thirteen** all-new palettes",
    "_thirteen_ all-new palettes",
    "`thirteen` all-new palettes",
    "thirteen&#160;all-new palettes",
  ]) {
    const fixtureRoot = await makeFixture(t);
    const readmePath = join(fixtureRoot, "README.md");
    const readme = await readFile(readmePath, "utf8");
    assert.equal(readme.split("twelve all-new palettes").length, 2, "fixture anchor must be unique");
    await writeFile(readmePath, readme.replace("twelve all-new palettes", spelling));

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `${spelling} shipped green`);
    assert.match(result.stderr, /README\.md:\d+ says "thirteen all-new palettes" but the packs ship/, spelling);
  }
});

test("names the line of a count after a tag that spans lines", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // A tag drops out of the text, but its line breaks stay, so the line named
  // is the line the count is on.
  const readmePath = join(fixtureRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  assert.equal(readme.split("twelve all-new palettes").length, 2, "fixture anchor must be unique");
  const edited = readme.replace(
    "twelve all-new palettes",
    '<span\n  title="x"></span>thirteen all-new palettes',
  );
  const line = edited.slice(0, edited.indexOf("thirteen all-new")).split("\n").length;
  await writeFile(readmePath, edited);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a stale count after a multi-line tag shipped green");
  assert.match(result.stderr, new RegExp(`README\\.md:${line} says "thirteen all-new palettes"`));
});

test("reads number words past sixty", { timeout: 200_000 }, async (t) => {
  // A third pack would put the total past seventy, and the table stopped at
  // sixty: "seventy-four themes" was not read as a count at all.
  for (const stated of ["seventy palettes", "seventy-four palettes", "ninety-nine palettes"]) {
    const fixtureRoot = await makeFixture(t);
    const readmePath = join(fixtureRoot, "README.md");
    const readme = await readFile(readmePath, "utf8");
    assert.equal(readme.split("twelve all-new palettes").length, 2, "fixture anchor must be unique");
    await writeFile(readmePath, readme.replace("twelve all-new palettes", stated));

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `${stated} passed unread`);
    assert.match(result.stderr, new RegExp(`README\\.md:\\d+ says "${stated}" but the packs ship`));
  }
});

test("rejects a stale role-aware count in any note Pages renders", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // The count was read on the storefront and the share card; PROMOTION_QUEUE.md
  // states it too, in the stat row it asks to be posted.
  const notePath = join(fixtureRoot, "PROMOTION_QUEUE.md");
  const note = await readFile(notePath, "utf8");
  const claims = [...note.matchAll(/(\d+) role-aware checks/g)];
  assert.equal(claims.length, 1, "fixture anchor must be unique");
  const stale = Number(claims[0][1]) + 1;
  await writeFile(notePath, note.replace(claims[0][0], `${stale} role-aware checks`));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a stale role-aware count in a served note shipped green");
  assert.match(result.stderr, new RegExp(`PROMOTION_QUEUE\\.md:\\d+ claims ${stale} role-aware checks; the verifier runs`));
});

// The review of 453ff81 (three lenses, every finding re-run by a second
// agent) found counts a reader sees that the scan did not read. Each case is
// a reproduction it made on the real tree, and each passed verify before.
for (const [form, page, from, to, message] of [
  ["a meta description", "index.html", 'content="Browse and install 50 hand-tuned dark themes',
    'content="Browse and install 51 hand-tuned dark themes', /index\.html:\d+ says "51 hand-tuned dark themes"/],
  ["a page's body text", "claude-code-theme-install-guide.html", "<h1>How to install 50 dark themes",
    "<h1>How to install 51 dark themes", /claude-code-theme-install-guide\.html:\d+ says "51 dark themes"/],
  ["a hyphenated count", "DIRECTORY_SUBMISSION_PACK.md", "free 12-theme Vol. 2 expansion, UI kits",
    "free 13-theme Vol. 2 expansion, UI kits", /DIRECTORY_SUBMISSION_PACK\.md:\d+ says "13-theme"/],
  ["a count before an edition", "README.md", "## The 12 Vol. 2 themes", "## The 13 Vol. 2 themes",
    /README\.md:\d+ says "13 Vol\. 2 themes"/],
  ["the first of a pair", "PROMOTION_QUEUE.md", "- Stat row: 50 + 12 themes", "- Stat row: 51 + 12 themes",
    /PROMOTION_QUEUE\.md:\d+ says "51 \+ 12 themes"/],
  ["a count with a plus", "index.html", "<div><dt>50</dt><dd>hand-tuned themes</dd></div>",
    "<div><dt>70+</dt><dd>hand-tuned themes</dd></div>", /index\.html:\d+ says "70\+ hand-tuned themes"/],
  ["five words between", "README.md", "The same 50 themes are a **free download** on the",
    "The same 51 hand-tuned dark Claude Code themes are a **free download** on the",
    /README\.md:\d+ says "51 hand-tuned dark Claude Code themes"/],
  ["a comma between", "README.md", "The same 50 themes are a **free download** on the",
    "The same 51 dark, hand-tuned themes are a **free download** on the", /README\.md:\d+ says "51 dark, hand-tuned themes"/],
  ["a count in quotation-mark entities", "index.html", "download the 50 themes as a free zip",
    "download &ldquo;51 dark themes&rdquo; as a free zip", /index\.html:\d+ says "51 dark themes"/],
  ["a hexadecimal no-break space", "semantic-terminal-colors.html", "<p>Every Vol.&nbsp;2 palette is previewed",
    "<p>All 51&#xA0;dark themes.</p><p>Every Vol.&nbsp;2 palette is previewed", /semantic-terminal-colors\.html:\d+ says "51 dark themes"/],
  ["a count after a lone <", "README.md", "## The 12 Vol. 2 themes",
    "The download is < 200 KB for all 51 dark themes -> one command.\n\n## The 12 Vol. 2 themes",
    /README\.md:\d+ says "51 dark themes"/],
  ["a count in a Markdown link", "README.md", "The same 50 themes are a **free download** on the",
    "The same [51](https://gabs-utilities.com/) themes are a **free download** on the", /README\.md:\d+ says "51 themes"/],
  ["a theme pack in the singular", "README.md", "The same 50 themes are a **free download** on the",
    "The same 51 theme pack is a **free download** on the", /README\.md:\d+ says "51 theme pack"/],
  ["a soft hyphen in a word between", "semantic-terminal-colors.html", "<p>Every Vol.&nbsp;2 palette is previewed",
    "<p>All 51 hand&shy;tuned dark themes.</p><p>Every Vol.&nbsp;2 palette is previewed",
    /semantic-terminal-colors\.html:\d+ says "51 hand.?tuned dark themes"/],
  ["a soft hyphen as a numeric reference", "semantic-terminal-colors.html", "<p>Every Vol.&nbsp;2 palette is previewed",
    "<p>All 51 hand&#173;tuned dark themes.</p><p>Every Vol.&nbsp;2 palette is previewed",
    /semantic-terminal-colors\.html:\d+ says "51 handtuned dark themes"/],
  ["a soft hyphen character in a note", "README.md", "The same 50 themes are a **free download** on the",
    "The same 51 hand\u00adtuned themes are a **free download** on the", /README\.md:\d+ says "51 handtuned themes"/],
  ["a plugin's README", "plugins/50-dark-themes/README.md", "This plugin adds all 50 themes", "This plugin adds all 51 themes",
    /plugins\/50-dark-themes\/README\.md:\d+ says "51 themes"/],
  // The re-attack of 2026-10-19 (every finding re-run by a second agent):
  // spellings and surfaces the rebuilt scan still missed.
  ["a link with a title inside the count", "semantic-terminal-colors.html",
    "Dark Themes Vol.&nbsp;2: twelve more palettes",
    "Dark Themes Vol.&nbsp;2: thirteen <a href=\"#vol2\" title=\"Jump to the install command\">more palettes</a>",
    /semantic-terminal-colors\.html:\d+ says "thirteen more palettes"/],
  ["a raw > in a meta description", "index.html",
    "content=\"Browse and install 50 hand-tuned dark themes for Claude Code as a native plugin,",
    "content=\"Browse and install 51 hand-tuned dark themes for Claude Code (every role at contrast > 4.5:1) as a native plugin,",
    /index\.html:8 says "51 hand-tuned dark themes"/],
  ["an aria-description", "index.html",
    "<p class=\"kicker\">50 dark themes \u00b7 Claude Code</p>",
    "<p class=\"kicker\" aria-description=\"51 dark themes for Claude Code\">50 dark themes \u00b7 Claude Code</p>",
    /index\.html:\d+ says "51 dark themes"/],
  ["an aria-roledescription", "index.html",
    "<p class=\"kicker\">50 dark themes \u00b7 Claude Code</p>",
    "<p class=\"kicker\" aria-roledescription=\"51 dark themes for Claude Code\">50 dark themes \u00b7 Claude Code</p>",
    /index\.html:\d+ says "51 dark themes"/],
  ["a blockquote continued across lines", "README.md",
    "Six skills for running",
    "> The flagship pack ships 51\n> hand-tuned dark themes.\n\nSix skills for running",
    /README\.md:\d+ says "51 hand-tuned dark themes"/],
  ["a reference-style link", "README.md",
    "the repository verifies the theme schema, gallery parity, installation command and payment links on every push.",
    "the repository verifies the theme schema, gallery parity, installation command and payment links on every push.\n\nBrowse all [51][gallery] themes in the gallery.\n\n[gallery]: https://gabs-utilities.com/\n",
    /README\.md:\d+ says "51 themes"/],
  ["a footnote mark", "README.md",
    "the repository verifies the theme schema, gallery parity, installation command and payment links on every push.",
    "the repository verifies the theme schema, gallery parity, installation command and payment links on every push.\n\nBrowse all 51[^1] themes in the gallery.\n",
    /README\.md:\d+ says "51 themes"/],
  ["an ampersand between", "README.md",
    "(all 50 themes, plus the 12 Vol. 2 themes,",
    "(all 51 syntax & UI themes, plus the 12 Vol. 2 themes,",
    /README\.md:\d+ says "51 syntax & UI themes"/],
  ["an accented word between", "README.md",
    "(all 50 themes, plus the 12 Vol. 2 themes,",
    "(all 51 caf\u00e9-noir themes, plus the 12 Vol. 2 themes,",
    /README\.md:\d+ says "51 caf\u00e9-noir themes"/],
  ["a pair joined by and", "README.md",
    "(all 50 themes, plus the 12 Vol. 2 themes,",
    "(two packs, 51 and 12 themes,",
    /README\.md:\d+ says "51 and 12 themes"/],
  ["a < in a Markdown code block", "README.md",
    "the repository verifies the theme schema, gallery parity, installation command and payment links on every push.",
    "the repository verifies the theme schema, gallery parity, installation command and payment links on every push.\n\n```js\nfor (let i = 0; i<themes.length; i++) install(themes[i]);\n```\n\nThat loop installs the flagship pack's 51 themes.\n\n```js\nthemes.forEach((t) => install(t));\n```\n",
    /README\.md:\d+ says "51 themes"/],
  // The same with no quote in between, which the quote-aware reader would
  // otherwise stop at: only the rule that a tag's name ends at a space, "/"
  // or ">" keeps "<themes.length" from opening a tag.
  ["a < in a Markdown code block, no quote after it", "README.md",
    "the repository verifies the theme schema, gallery parity, installation command and payment links on every push.",
    "the repository verifies the theme schema, gallery parity, installation command and payment links on every push.\n\n```js\nfor (let i = 0; i<themes.length; i++) install(themes[i]);\n```\n\nThat loop installs all 51 themes.\n\n```js\nthemes.forEach((t) => install(t));\n```\n",
    /README\.md:\d+ says "51 themes"/],
  ["a launch draft under assets/", "assets/product-hunt/SEMANTIC_NOCTURNE.md",
    "The palette is painstakingly tuned",
    "Each of the 63 palettes is painstakingly tuned",
    /assets\/product-hunt\/SEMANTIC_NOCTURNE\.md:5 says "63 palettes"/],
  ["the marketplace's own description", ".claude-plugin/marketplace.json",
    "\"description\": \"Installable color-theme packs and studio skills for Claude Code.\"",
    "\"description\": \"63 dark color themes and six studio skills for Claude Code, installable as plugins.\"",
    /\.claude-plugin\/marketplace\.json:7 says "63 dark color themes"/],
]) {
  test(`reads a stale theme count written as ${form}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await editPage(t, page, from, to);
    const result = await runVerifier(fixtureRoot);
    assert.notEqual(result.code, 0, `${form} with a stale count shipped green`);
    assert.match(result.stderr, message);
  });
}

for (const [form, page, from, to, message] of [
  ["with a plus", "index.html", "<div><dt>894</dt><dd>role-aware checks</dd></div>",
    "<div><dt>1,000+</dt><dd>role-aware checks</dd></div>", /index\.html:\d+ claims 1000 role-aware checks/],
  ["in another page's meta description", "semantic-terminal-colors.html",
    'content="Practical design notes from building 50 free Claude Code themes:',
    'content="Practical design notes from building 50 free Claude Code themes, checked by 726 role-aware contrast comparisons:',
    /semantic-terminal-colors\.html:\d+ claims 726 role-aware checks/],
  ["with a word between", "PROMOTION_QUEUE.md", "· 894 role-aware checks ·", "· 726 WCAG role-aware checks ·",
    /PROMOTION_QUEUE\.md:\d+ claims 726 role-aware checks/],
  ["with a plus in a note", "PROMOTION_QUEUE.md", "· 894 role-aware checks ·", "· 900+ role-aware checks ·",
    /PROMOTION_QUEUE\.md:\d+ claims 900 role-aware checks/],
  // The storefront's own check reads any "<n> role-aware" claim, whatever noun
  // follows; the prose scan above needs "checks" or "comparisons".
  ["with a plus on the storefront, whatever noun follows", "index.html",
    "<div><dt>894</dt><dd>role-aware checks</dd></div>",
    "<div><dt>894</dt><dd>role-aware checks</dd></div><p>Over <b>900+</b> role-aware contrast pairs are held.</p>",
    /index\.html:\d+ claims 900 role-aware checks/],
  ["with a word between role-aware and checks", "semantic-terminal-colors.html",
    "They leave the same status colors on the base preset",
    "They pass the same 900 role-aware WCAG contrast checks, leave the same status colors on the base preset",
    /semantic-terminal-colors\.html:\d+ claims 900 role-aware checks/],
]) {
  test(`reads a stale role-aware count ${form}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await editPage(t, page, from, to);
    const result = await runVerifier(fixtureRoot);
    assert.notEqual(result.code, 0, `a role-aware count ${form} shipped green`);
    assert.match(result.stderr, message);
  });
}

// The same review's false-refusals lens: ordinary prose the scan refused.
// Each passes now, on a file the scan still reads.
for (const [prose, page, from, to] of [
  ["one of the themes", "semantic-terminal-colors.html", "<h2>The terminal owns the background.</h2>",
    "<h2>The terminal owns the background.</h2>\n<p>Dracula is one of the themes most people try first.</p>"],
  ["one of my favourite themes", "DEV_COMMUNITY_ARTICLE_DRAFT.md", "## Contrast matters more than vibe",
    "Graphite is one of my favourite themes to demo.\n\n## Contrast matters more than vibe"],
  ["every one of the palettes, one or more themes", "README.md", "## Note on backgrounds",
    "Every one of the palettes passes; if one or more themes fail, CI goes red.\n\n## Note on backgrounds"],
  ["90 percent of themes, 9 roles across all themes", "README.md", "## Note on backgrounds",
    "About 90 percent of themes pass at once; contrast is checked for 9 roles across all themes.\n\n## Note on backgrounds"],
  ["a date before the themes", "PROMOTION_QUEUE.md", "## Safe launch order",
    "Since Oct 19 the themes ship with a contrast check.\n\n## Safe launch order"],
  ["Volume 2 themes", "PROMOTION_QUEUE.md", "## Safe launch order", "Volume 2 themes are live.\n\n## Safe launch order"],
  ["a price before the noun", "PROMOTION_QUEUE.md", "## Safe launch order",
    "The $9 palettes product is listed separately.\n\n## Safe launch order"],
  ["the total written with a space", "README.md", "## Note on backgrounds",
    "Install both packs for sixty two themes.\n\n## Note on backgrounds"],
  ["a file name", "README.md", "## Note on backgrounds",
    "Preview the index with `head -n 20 themes.json`.\n\n## Note on backgrounds"],
  ["a CSS comment", "index.html", "</style>", "  /* 4 themes per row on desktop */\n</style>"],
  ["WCAG 2.1 and 7:1 before role-aware", "semantic-terminal-colors.html", "<h2>The terminal owns the background.</h2>",
    "<h2>The terminal owns the background.</h2>\n<p>Each theme passes WCAG 2.1 role-aware contrast checks; body text clears a 7:1 role-aware minimum.</p>"],
  ["role-aware rules, not checks", "README.md", "## Note on backgrounds",
    "The 3 role-aware rules are AAA text, AA accents and the non-text floor.\n\n## Note on backgrounds"],
  ["a version before role-aware on the storefront", "index.html", "<div><dt>894</dt><dd>role-aware checks</dd></div>",
    "<div><dt>894</dt><dd>role-aware checks</dd></div><p>Held to WCAG 2.1 role-aware floors.</p>"],
  ["another product's count wrapped across a line", "README.md", "## Note on backgrounds",
    "Lowlight has 70 VS\nCode themes; the 70 Visual Studio Code themes are another pack.\n\n## Note on backgrounds"],
  // The re-attack's false refusals, each passing now.
  ["a demonstrative before the noun", "plugins/50-dark-themes/README.md",
    "The themes are free and MIT licensed.\n\n```text",
    "The themes are free and MIT licensed.\n\nTwo commands install these themes:\n\n```text"],
  ["a version and a preposition before the noun", "README.md",
    "checks any theme against WCAG floors and exits non-zero in CI.",
    "checks any theme against WCAG floors and exits non-zero in CI. It needs only Python 3 to check your own themes."],
  ["only a preposition before the noun", "README.md",
    "## Note on backgrounds",
    "The picker offers 3 accent colours for dark themes.\n\n## Note on backgrounds"],
  ["one theme pack", "claude-code-theme-install-guide.html",
    "<p>Both packs then appear together in <code>/theme</code>.",
    "<p>Install one theme pack or both; installed packs appear together in <code>/theme</code>."],
  ["a count of theme packs", "README.md",
    "## Note on backgrounds",
    "Two theme packs, dark themes in both.\n\n## Note on backgrounds"],
  ["a step badge", "claude-code-theme-install-guide.html",
    "Use <code>Ctrl+E</code> if you want an editable copy.</p></div></article>",
    "Use <code>Ctrl+E</code> if you want an editable copy.</p></div></article>\n            <article class=\"step\"><span class=\"num\">04</span><div><h3>Switch themes any time.</h3><p>Run <code>/theme</code> again; the change applies immediately.</p></div></article>"],
  ["a list bullet", "README.md",
    "## Manual install\n",
    "## At a glance\n\n- Plugins: 3\n- Themes: 62\n- License: MIT\n\n## Manual install\n"],
  ["an ordinal split by markup", "semantic-terminal-colors.html",
    "<h2>The terminal owns the background.</h2>",
    "<h2>The terminal owns the background.</h2>\n          <p>Vol.&nbsp;2 is the 2<sup>nd</sup> theme pack in the same marketplace.</p>"],
  ["an entity this reader does not know", "index.html",
    "<span>50 dark themes for Claude Code</span>",
    "<span>50 dark themes for Claude Code</span>\n    <span>Plugins: 3 &bull; Themes: 62 &bull; Skills: 6</span>"],
  ["a date before an edition", "PROMOTION_QUEUE.md",
    "## Safe launch order",
    "As of 19 October, Vol. 2 themes are previewed in the gallery.\n\n## Safe launch order"],
  ["one another", "README.md",
    "They route to one another, so you rarely have to name one.",
    "They route to one another, so skills rarely need to be named."],
  ["a clause comma before role-aware", "README.md",
    "## Note on backgrounds",
    "Since Vol. 2, role-aware checks cover both packs.\n\n## Note on backgrounds"],
  ["a comment holding >", "index.html",
    "<div class=\"grid\" id=\"vol2Grid\"></div>",
    "<!-- layout: grid -> 4 themes per row on desktop -->\n      <div class=\"grid\" id=\"vol2Grid\"></div>"],
  ["a numbered thread", "PROMOTION_QUEUE.md",
    "### X launch post",
    "### X thread \u2014 Vol. 2\n\n```text\n1/ Twelve all-new dark themes for Claude Code, free.\n\n2/ Same semantic status colors, same contrast floors.\n```\n\n### X launch post"],
  ["a hex colour", "README.md",
    "(listed in the gallery page, e.g. Graphite = #1D1E20).",
    "(listed in the gallery page, e.g. Graphite = #1D1E20). On #222 backgrounds dark themes still pass."],
  ["two editions", "README.md",
    "## Note on backgrounds",
    "Vols. 1 and 2 themes share one semantic palette.\n\n## Note on backgrounds"],
  ["a role-aware count per theme", "README.md",
    "## Note on backgrounds",
    "The verifier runs 14 role-aware checks per theme.\n\n## Note on backgrounds"],
]) {
  test(`accepts ordinary prose: ${prose}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await editPage(t, page, from, to);
    const result = await runVerifier(fixtureRoot);
    assert.equal(result.code, 0, `ordinary prose was refused: ${result.stderr}`);
  });
}

// Which files are read is a decision, and each side of it is pinned: the
// working notes narrate history and the product notes use "atmospheres" and
// "palettes" as sound terms, while a note written to be posted and a skill
// that ships to installers state the packs' size to a reader.
for (const [file, from, to] of [
  ["CLAUDE.md", "## Payment surfaces — read before adding any buy button",
    "When the pack had 40 themes, the share card said 726 role-aware checks.\n\n## Payment surfaces — read before adding any buy button"],
  ["CONTRIBUTING.md", "exactly 50 root-level theme files", "exactly 51 root-level theme files"],
  ["docs/TOOLING_AUDIT.md", "## 2. Five skills referenced but missing", "Once, 40 themes shipped.\n\n## 2. Five skills referenced but missing"],
  ["products/industrial-tension-fx/LISTING.md", "- 10 four-second noise rises and falls",
    "- 10 four-second noise rises and falls\n- 6 dark atmospheres for breakdowns"],
]) {
  test(`does not read counts in ${file}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await editPage(t, file, from, to);
    const result = await runVerifier(fixtureRoot);
    assert.equal(result.code, 0, `${file} is read as a surface that states the packs' size: ${result.stderr}`);
  });
}
for (const [file, content, message] of [
  ["LAUNCH_NOTES.md", "# Launch\n\n51 dark themes for Claude Code.\n", /LAUNCH_NOTES\.md:3 says "51 dark themes"/],
]) {
  test(`reads counts in a new root note, ${file}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await addFile(t, file, content);
    const result = await runVerifier(fixtureRoot);
    assert.notEqual(result.code, 0, "a stale count in a root note shipped green");
    assert.match(result.stderr, message);
  });
}
test("reads counts in a skill that ships to installers", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  for (const copy of [".claude/skills/storefront-exposure/SKILL.md", "plugins/berlin-studio-skills/skills/storefront-exposure/SKILL.md"]) {
    const path = join(fixtureRoot, copy);
    const text = await readFile(path, "utf8");
    assert.equal(text.split("consuming the 50 themes").length, 2, "fixture anchor must be unique");
    await writeFile(path, text.replace("consuming the 50 themes", "consuming the 40 themes"));
  }
  const result = await runVerifier(fixtureRoot);
  assert.notEqual(result.code, 0, "a stale count in a shipped skill passed");
  assert.match(result.stderr, /plugins\/berlin-studio-skills\/skills\/storefront-exposure\/SKILL\.md:\d+ says "40 themes"/);
});

test("lists every stale count in a file in one run", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await editPage(t, "DEV_COMMUNITY_ARTICLE_DRAFT.md", "## Contrast matters more than vibe",
    "Ghostty ships 300 themes and iTerm2 offers 250 palettes.\n\n## Contrast matters more than vibe");
  const result = await runVerifier(fixtureRoot);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /says "300 themes"; DEV_COMMUNITY_ARTICLE_DRAFT\.md:\d+ says "250 palettes" but the packs ship/);
});

test("reads a skills count however the README spells it, and requires one", { timeout: 300_000 }, async (t) => {
  for (const [to, message] of [
    ["Seven hand-written Claude Code agent skills for running", /README\.md:\d+ says "Seven hand-written Claude Code agent skills" but \d+ skills ship/],
    ["A seven-skill pack for running", /README\.md:\d+ says "seven-skill" but \d+ skills ship/],
    ["[Seven](https://gabs-utilities.com/) skills for running", /README\.md:\d+ says "Seven skills" but \d+ skills ship/],
    ["Skills for running", /README\.md no longer states how many skills ship in a form verify reads/],
  ]) {
    const fixtureRoot = await editPage(t, "README.md", "Six skills for running", to);
    const result = await runVerifier(fixtureRoot);
    assert.notEqual(result.code, 0, `${to} shipped green`);
    assert.match(result.stderr, message, to);
  }
});

test("accepts a correct count across a line break, in emphasis and in a note", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // Negative control for the three readings above: a count that agrees with
  // what ships passes however it is spelled, and so does a sentence about two
  // things that are not the packs, written without a number before the noun.
  const readmePath = join(fixtureRoot, "README.md");
  const readme = await readFile(readmePath, "utf8");
  assert.equal(readme.split("twelve all-new palettes").length, 2, "fixture anchor must be unique");
  await writeFile(readmePath, readme.replace("twelve all-new palettes", "**twelve**\nall-new palettes"));
  const notePath = join(fixtureRoot, "PROMOTION_QUEUE.md");
  const note = await readFile(notePath, "utf8");
  await writeFile(notePath, `${note}\nThe _fifty_ themes and the twelve\npalettes; a name used twice; sixty-two themes.\n`);

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a correct count was rejected: ${result.stderr}`);
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

// An install from this marketplace fails on a fresh machine until the
// marketplace is added, so a reader-facing file that shows one shows the add
// first: one file with no add at all, and one whose add comes only later.
for (const [where, page, from, to, message] of [
  ["with no marketplace add in the file", "llms.txt",
    "    claude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes\n", "",
    /llms\.txt:\d+ installs 50-dark-themes@notgabriels-themes before the marketplace is added/],
  ["before the file's first marketplace add", "PROMOTION_QUEUE.md",
    "Install it from the same marketplace (add it once):\n\nclaude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes\n",
    "Install it from the same marketplace:\n\n",
    /PROMOTION_QUEUE\.md:\d+ installs dark-themes-vol-2@notgabriels-themes before the marketplace is added/],
]) {
  test(`rejects an install ${where}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await editPage(t, page, from, to);

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `an install ${where} shipped green`);
    assert.match(result.stderr, message);
  });
}

// The repository root holds themes.json, the published index, beside the 50
// theme files; installing it put a 51st "theme" named after the pack in
// /theme. The installer reads the pack's packaged directory instead, and the
// themes folder follows CLAUDE_CONFIG_DIR as Claude Code's own config does.
test("installs exactly the pack's themes, and never the index", { timeout: 90_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), "gabs-install-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const run = (args, env = {}) =>
    execFileSync("bash", [join(projectRoot, "install.sh"), ...args], {
      encoding: "utf8",
      env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: "", ...env },
    });
  const pack = (await readdir(join(projectRoot, "plugins", "50-dark-themes", "themes"))).filter((f) => f.endsWith(".json")).sort();
  assert.equal(pack.length, 50);

  assert.match(run(["--list"]), /^50 themes$/m);
  assert.match(run([]), /Installed 50 theme\(s\)/);
  const installed = (await readdir(join(home, ".claude", "themes"))).sort();
  assert.deepEqual(installed, pack, "the themes folder holds exactly the packaged themes");
  assert.ok(!installed.includes("themes.json"), "the index was installed as a theme");

  const config = join(home, "config");
  assert.match(run([], { CLAUDE_CONFIG_DIR: config }), /Installed 50 theme\(s\) into .*config\/themes/);
  assert.deepEqual((await readdir(join(config, "themes"))).sort(), pack);
});

for (const [route, page, from, to] of [
  ["the README", "README.md",
    "cp claude-code-50-dark-themes/plugins/50-dark-themes/themes/*.json ~/.claude/themes/",
    "cp claude-code-50-dark-themes/*.json ~/.claude/themes/"],
  ["the install guide", "claude-code-theme-install-guide.html",
    '<span class="syntax-value">plugins/50-dark-themes/themes/*.json</span>',
    '<span class="syntax-value">*.json</span>'],
]) {
  test(`rejects a manual copy in ${route} that globs the repository root`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await editPage(t, page, from, to);

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `${route} copies themes.json into the themes folder`);
    assert.match(result.stderr, /copies \S*\*\.json into a themes folder\. That glob reaches the repository root/);
  });
}

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
  // The flagship pack's folder copied twice: a valid glob, and still no Vol. 2.
  await writeFile(
    fixtureGuide,
    guide.replaceAll("plugins/dark-themes-vol-2/themes/*.json", "plugins/50-dark-themes/themes/*.json"),
  );

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

async function readManifestVersion(fixtureRoot, plugin) {
  const manifest = JSON.parse(
    await readFile(join(fixtureRoot, "plugins", plugin, ".claude-plugin", "plugin.json"), "utf8"),
  );
  return manifest.version;
}

test("rejects a storefront that links a Vol. 2 zip of a version the pack does not ship", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureHtml = join(fixtureRoot, "index.html");
  const html = await readFile(fixtureHtml, "utf8");
  const version = await readManifestVersion(fixtureRoot, "dark-themes-vol-2");
  assert.notEqual(version, "0.9.0");
  const marker = "<div class=\"grid\" id=\"vol2Grid\"></div>";
  assert.ok(html.includes(marker), "the storefront should still render the Vol. 2 grid");
  await writeFile(
    fixtureHtml,
    html.replace(
      marker,
      `<p><a href="https://github.com/notgabriels-sys/claude-code-50-dark-themes/releases/download/dark-themes-vol-2-v0.9.0/claude-code-dark-themes-vol-2-v0.9.0.zip">zip</a></p>${marker}`,
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a Vol. 2 zip link for a version the pack does not ship");
  assert.match(
    result.stderr,
    /The storefront links a release that no shipped pack version claims: .*dark-themes-vol-2-v0\.9\.0/,
  );
});

test("accepts a storefront that links the Vol. 2 zip of the shipped version", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureHtml = join(fixtureRoot, "index.html");
  const html = await readFile(fixtureHtml, "utf8");
  const version = await readManifestVersion(fixtureRoot, "dark-themes-vol-2");
  const marker = "<div class=\"grid\" id=\"vol2Grid\"></div>";
  await writeFile(
    fixtureHtml,
    html.replace(
      marker,
      `<p><a href="https://github.com/notgabriels-sys/claude-code-50-dark-themes/releases/download/dark-themes-vol-2-v${version}/claude-code-dark-themes-vol-2-v${version}.zip">zip</a></p>${marker}`,
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, result.stderr);
});

test("rejects a storefront that drops the 50-theme zip link", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureHtml = join(fixtureRoot, "index.html");
  const html = await readFile(fixtureHtml, "utf8");
  const version = await readManifestVersion(fixtureRoot, "50-dark-themes");
  const anchor = new RegExp(
    `<a href="https://github\\.com/notgabriels-sys/claude-code-50-dark-themes/releases/download/themes-plugin-v${version.replaceAll(".", "\\.")}/claude-code-dark-themes-v${version.replaceAll(".", "\\.")}\\.zip">([^<]+)</a>`,
  );
  assert.match(html, anchor, "the storefront should link the current 50-theme zip");
  await writeFile(fixtureHtml, html.replace(anchor, "$1"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a storefront with no 50-theme zip link");
  assert.match(result.stderr, /must link the 50 Dark Themes zip at /);
});

test("rejects a README that stops naming the 50-theme zip", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureReadme = join(fixtureRoot, "README.md");
  const readme = await readFile(fixtureReadme, "utf8");
  const version = await readManifestVersion(fixtureRoot, "50-dark-themes");
  const zip = `\`claude-code-dark-themes-v${version}.zip\``;
  assert.ok(readme.includes(zip), "the README should name the current 50-theme zip");
  await writeFile(fixtureReadme, readme.replace(zip, "`themes.zip`"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a README that no longer names the 50-theme zip");
  assert.match(result.stderr, /README must link the 50 Dark Themes release as /);
});

test("rejects a README that links a release no shipped pack version claims", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureReadme = join(fixtureRoot, "README.md");
  const readme = await readFile(fixtureReadme, "utf8");
  await writeFile(
    fixtureReadme,
    `${readme}\nOld build: https://github.com/notgabriels-sys/claude-code-50-dark-themes/releases/tag/themes-plugin-v0.9.0\n`,
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a README linking a release of a version that is not shipped");
  assert.match(result.stderr, /README links a release that no shipped pack version claims: .*themes-plugin-v0\.9\.0/);
});

test("accepts a README that names the current release in prose with sentence punctuation after it", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureReadme = join(fixtureRoot, "README.md");
  const readme = await readFile(fixtureReadme, "utf8");
  const version = await readManifestVersion(fixtureRoot, "50-dark-themes");
  await writeFile(
    fixtureReadme,
    `${readme}\nThe zip lives on https://github.com/notgabriels-sys/claude-code-50-dark-themes/releases/tag/themes-plugin-v${version}, as before.\n`,
  );

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, result.stderr);
});

test("rejects a storefront whose stated release version drifts from the zip it links", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureHtml = join(fixtureRoot, "index.html");
  const html = await readFile(fixtureHtml, "utf8");
  const version = await readManifestVersion(fixtureRoot, "50-dark-themes");
  const caption = `</a> from the v${version} release`;
  assert.ok(html.includes(caption), "the storefront should state the linked release version beside the zip link");
  await writeFile(fixtureHtml, html.replace(caption, "</a> from the v9.9.9 release"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a zip link captioned with a version it does not resolve to");
  assert.match(result.stderr, new RegExp(`say "from the v${version.replaceAll(".", "\\.")} release" beside it`));
});

test("rejects a README whose release link text names a version the link does not resolve to", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureReadme = join(fixtureRoot, "README.md");
  const readme = await readFile(fixtureReadme, "utf8");
  const version = await readManifestVersion(fixtureRoot, "50-dark-themes");
  const text = `[v${version} GitHub release →]`;
  assert.ok(readme.includes(text), "the README should name the release version in the link text");
  await writeFile(fixtureReadme, readme.replace(text, "[v9.9.9 GitHub release →]"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted README link text naming a version the link does not resolve to");
  assert.match(result.stderr, /README must link the 50 Dark Themes release as /);
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
async function reviewScript(fixtureRoot, page, text) {
  const hash = `sha256-${createHash("sha256").update(text, "utf8").digest("base64")}`;
  const verifyPath = join(fixtureRoot, "scripts", "verify.mjs");
  const source = await readFile(verifyPath, "utf8");
  const entry = `["${page}", ["`;
  assert.equal(source.split(entry).length, 2, `reviewedInlineScripts must hold one entry for ${page}`);
  await writeFile(verifyPath, source.replace(entry, `${entry}${hash}", "`));
  const pagePath = join(fixtureRoot, page);
  const markup = await readFile(pagePath, "utf8");
  assert.equal(markup.split("; worker-src 'none'").length, 2, `${page} must carry one policy`);
  await writeFile(pagePath, markup.replace("; worker-src 'none'", ` '${hash}'; worker-src 'none'`));
}
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
    /index\.html:\d+ has a script tag spelled "<script type='application\/ld\+json'>"/],
  ["a script closed in capitals", "index.html", markerEnd,
    `${markerEnd}\n<script type="application/ld+json">{}</SCRIPT>`,
    /index\.html:\d+ closes a script with "<\/SCRIPT>"/],
  ["the theme list wrapped in a template", "index.html", markerStart, `<template>${markerStart}`,
    /index\.html:\d+ uses <template>/],
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
  // The re-attack of the allowlist: each of these was a second list a
  // conformant reader saw while verify stayed green. "&#76;" is an "L" that
  // the raw "ItemList" count never decodes.
  ["an ItemList type built from an @vocab", "index.html", markerEnd,
    `${markerEnd}\n<script type="application/ld+json">${wrongList
      .replace('"@context":"https://schema.org"', '"@context":["https://schema.org",{"@vocab":"http://schema.org/Item"}]')
      .replace('"@type":"ItemList"', '"@type":"List"')}</script>`,
    /index\.html's JSON-LD block on line \d+ has @context \["https:\/\/schema\.org",\{/],
  ["an ItemList type built from a prefix term", "index.html", markerEnd,
    `${markerEnd}\n<script type="application/ld+json">${wrongList
      .replace('"@context":"https://schema.org"',
        '"@context":["https://schema.org",{"il":{"@id":"http://schema.org/Item","@prefix":true}}]')
      .replace('"@type":"ItemList"', '"@type":"il:List"')}</script>`,
    /index\.html's JSON-LD block on line \d+ has @context \["https:\/\/schema\.org",\{/],
  ["a nested @context on another page", "claude-code-theme-install-guide.html", "</head>",
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","mainEntity":' +
      '{"@context":{"@vocab":"http://schema.org/Item"},"@type":"List","name":"Dracula"}}</script>\n</head>',
    /claude-code-theme-install-guide\.html's JSON-LD block on line \d+ has @context "https:\/\/schema\.org" and 2 @context key\(s\)/],
  ["a JSON-LD block that is an array", "claude-code-theme-install-guide.html", "</head>",
    '<script type="application/ld+json">[{"@context":"https://schema.org","@type":"WebPage","name":"Dracula"}]</script>\n</head>',
    /claude-code-theme-install-guide\.html's JSON-LD block on line \d+ is not one object/],
  ["an @context written twice", "index.html", markerEnd,
    `${markerEnd}\n<script type="application/ld+json">{"@context":{"@vocab":"http://schema.org/Item"},` +
      '"@context":"https://schema.org","@type":"List","name":"Dracula"}</script>',
    /index\.html's JSON-LD block on line \d+ writes the key "@context" twice in one object/],
  ["microdata with attributes separated by slashes", "index.html", "</body>",
    '<div/itemscope/itemtype="https://schema.org/Item&#76;ist"><meta/itemprop="name"/content="Dracula"></div>\n</body>',
    /index\.html carries microdata or RDFa \("itemscope" on <div>\)/],
  ["microdata after a quoted >", "index.html", "</body>",
    '<div title="a>b" itemscope itemtype="https://schema.org/Item&#76;ist"></div>\n</body>',
    /index\.html carries microdata or RDFa \("itemscope" on <div>\)/],
  ["microdata in capitals", "index.html", "</body>",
    '<DIV ITEMSCOPE ITEMTYPE="https://schema.org/Item&#76;ist"></DIV>\n</body>',
    /index\.html carries microdata or RDFa \("itemscope" on <div>\)/],
  ["microdata straight after a closing quote", "index.html", "</body>",
    '<div title="x"itemscope itemtype="https://schema.org/Item&#76;ist"></div>\n</body>',
    /index\.html carries microdata or RDFa \("itemscope" on <div>\)/],
  ["microdata between attribute values that spell style tags", "index.html", "</body>",
    '<span title="<style>"></span><div itemscope itemtype="https://schema.org/Item&#76;ist"></div>' +
      '<span title="</style>"></span>\n</body>',
    /index\.html carries microdata or RDFa \("itemscope" on <div>\)/],
  ["microdata after a comment closed with --!>", "index.html", "</body>",
    '<!-- note --!><div itemscope itemtype="https://schema.org/Item&#76;ist"></div>\n</body>',
    /index\.html carries microdata or RDFa \("itemscope" on <div>\)/],
  // A browser ends <!--> and <!---> on the spot (Chromium's DOM, checked), so
  // what follows is markup, not the rest of a comment.
  ["microdata after an empty comment written <!-->", "index.html", "</body>",
    '<!--><div itemscope itemtype="https://schema.org/Item&#76;ist"></div> -->\n</body>',
    /index\.html carries microdata or RDFa \("itemscope" on <div>\)/],
  ["microdata after an empty comment written <!--->", "index.html", "</body>",
    '<!---><div itemscope itemtype="https://schema.org/Item&#76;ist"></div> -->\n</body>',
    /index\.html carries microdata or RDFa \("itemscope" on <div>\)/],
  ["RDFa vocab and typeof behind slashes", "index.html", "</body>",
    '<div/vocab="https://schema.org/"/typeof="Item&#76;ist"><meta/property="name"/content="Dracula"></div>\n</body>',
    /index\.html carries microdata or RDFa \("vocab" on <div>\)/],
  ["an RDFa prefix declared through xmlns", "index.html", "</body>",
    '<div xmlns:s="https://schema.org/Item"><span>Dracula</span></div>\n</body>',
    /index\.html carries microdata or RDFa \("xmlns:s" on <div>\)/],
  ["an RDFa type stated through rel", "index.html", "</body>",
    '<a rel="rdf:type" href="https://schema.org/Item&#76;ist">Dracula</a>\n</body>',
    /index\.html has rel="rdf:type" on <a>/],
  ["an RDFa type stated through property", "index.html", "</body>",
    '<link property="rdf:type" href="https://schema.org/Item&#76;ist">\n</body>',
    /index\.html has property="rdf:type" on <link>/],
  ["microdata after a quoted > in single quotes", "index.html", "</body>",
    "<div title='a>b' itemscope itemtype=\"https://schema.org/Item&#76;ist\"></div>\n</body>",
    /index\.html carries microdata or RDFa \("itemscope" on <div>\)/],
  ["an RDFa type stated through typeof alone", "index.html", "</body>",
    '<div typeof="schema:Item&#76;ist"><span>Dracula</span></div>\n</body>',
    /index\.html carries microdata or RDFa \("typeof" on <div>\)/],
  ["an RDFa rel spelled with a character reference", "index.html", "</body>",
    '<a rel="rdf&colon;type" href="https://schema.org/Item&#76;ist">Dracula</a>\n</body>',
    /index\.html has rel="rdf&colon;type" on <a>/],
  ["a default namespace other than XHTML", "index.html", "</body>",
    '<div xmlns="http://schema.org/"><span>Dracula</span></div>\n</body>',
    /index\.html carries microdata or RDFa \("xmlns" on <div>\)/],
  // A browser reads a <title>'s content as text, so none of these opens
  // anything; a reader that took it as markup hid the div that follows
  // (Chromium's DOM, checked for all three).
  ["microdata after a title holding a comment opener", "index.html", "</body>",
    '<title>x<!--</title><div itemscope itemtype="https://schema.org/Item&#76;ist"></div><title>--></title>\n</body>',
    /index\.html carries microdata or RDFa \("itemscope" on <div>\)/],
  ["microdata after a title holding a style tag", "index.html", "</body>",
    '<title><style></title><div itemscope itemtype="https://schema.org/Item&#76;ist"></div><title></style></title>\n</body>',
    /index\.html carries microdata or RDFa \("itemscope" on <div>\)/],
  ["microdata after a title holding a script tag", "index.html", "</body>",
    '<title><script></title><div itemscope itemtype="https://schema.org/Item&#76;ist"></div><title></script></title>\n</body>',
    /index\.html carries microdata or RDFa \("itemscope" on <div>\)/],
  // "<!--<script>" puts a browser's script tokenizer in its escaped states,
  // where </script> no longer ends the element: the theme list became the
  // tail of this block's text, and no ItemList script existed (Chromium's
  // DOM, checked). The comment keeps the open/close count balanced.
  ["a script that swallows the theme list", "index.html", markerStart,
    '<!-- </script> -->\n<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage",' +
      `"name":"Dark themes <!--<script>"}</script>\n${markerStart}`,
    /index\.html has a <script> whose text holds "<!--"/],
  ["microdata hidden in an inline math", "index.html", "</body>",
    '<math><style><div itemscope itemtype="https://schema.org/Item&#76;ist"></div></style></math>\n</body>',
    /index\.html has an inline <math>/],
  // A browser lifts this div out of the svg into the page with its attributes
  // (Chromium's DOM, checked); a reader that takes <style> as raw text never
  // sees it.
  ["microdata hidden in an inline svg", "index.html", "</body>",
    '<svg><style><div itemscope itemtype="https://schema.org/Item&#76;ist"></div></style></svg>\n</body>',
    /index\.html has an inline <svg>/],
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

// Negative controls: markup that only looks like structured data. A reader
// that rejected these would be matching text, not reading tags.
for (const [control, page, from, to] of [
  // The ">" matters: read as anything but a comment, "<!-- 1 >" would end at
  // it and leave the div outside.
  ["microdata inside a comment", "index.html", "</body>",
    '<!-- 1 > 0, <div itemscope itemtype="https://schema.org/Item&#76;ist"></div> -->\n</body>'],
  ["structured-data words as values and data attributes", "index.html", "</body>",
    '<div title="itemscope typeof" data-itemscope="vocab"></div>\n</body>'],
  ["plain rel link types", "index.html", "</body>",
    '<a href="impressum.html" rel="noopener noreferrer">Impressum</a>\n</body>'],
  ["Open Graph article properties", "claude-code-theme-install-guide.html", "</head>",
    '<meta property="article:published_time" content="2026-08-24T00:00:00+02:00">\n</head>'],
  ["the XHTML namespace on <html>", "index.html", '<html lang="en">',
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="en">'],
  // The lone "}" in a string matters: a scanner that read it as markup would
  // close the inner object early and find "name" twice in the outer one.
  ["one key in two objects, and braces and colons inside strings", "claude-code-theme-install-guide.html", "</head>",
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage",' +
      '"name":"a {\\"name\\": 1, \\"name\\": 2} \\u003c!-- \\\\","about":{"@type":"Thing","description":"one } brace","name":"b"}}</script>\n</head>'],
  ["typeof in a script", "index.html", "</body>",
    '<script>if (1 <b && typeof window === "object") {}</script>\n</body>'],
]) {
  test(`accepts ${control}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await editPage(t, page, from, to);
    // A second script is reviewed by hash before it may run, so this one is
    // reviewed the way a contributor would: in the table and in the policy.
    if (control === "typeof in a script") await reviewScript(fixtureRoot, page, 'if (1 <b && typeof window === "object") {}');

    const result = await runVerifier(fixtureRoot);

    assert.equal(result.code, 0, `${control} was rejected: ${result.stderr}`);
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

// Links a browser follows. Each of the first nine shipped with verify green on
// 2026-10-18; Chromium resolves the three spellings of buy.stripe.com to the
// same checkout. The provider and its ids are made up.
const payLink = (href) => `<p><a href="${href}">Pay</a></p>\n</body>`;
for (const [defect, page, from, to, message] of [
  ["a Stripe link on another public page", "impressum.html", "</body>", payLink("https://buy.stripe.com/test_0"),
    /impressum\.html:\d+ contains "stripe"\. No Stripe link is verified/],
  ["a checkout host spelled with a numeric character reference", "index.html", "</body>",
    payLink("https://buy.&#115;tripe.com/test_0"), /has an "&" not written "&amp;"/],
  ["a checkout host spelled with percent-encoding", "index.html", "</body>",
    payLink("https://buy.%73tripe.com/test_0"), /reaches buy\.stripe\.com, but the host is written "buy\.%73tripe\.com"/],
  ["a checkout on an unreviewed provider", "index.html", "</body>",
    payLink("https://checkout.example-pay.invalid/b/0"),
    /links to checkout\.example-pay\.invalid, which is not a reviewed link host/],
  ["a PayPal.me link", "index.html", "</body>", payLink("https://www.paypal.com/paypalme/someone/1200EUR"),
    /goes to www\.paypal\.com\/paypalme\/someone\/1200EUR, which is not a verified payment object/],
  ["a PayPal donate button", "index.html", "</body>", payLink("https://www.paypal.com/donate/?hosted_button_id=ZZZZ"),
    /goes to www\.paypal\.com\/donate\/\?hosted_button_id=ZZZZ, which is not a verified payment object/],
  ["an unverified PayPal NCP id behind a named reference", "index.html", "</body>",
    payLink("https://www.paypal&period;com/ncp/payment/ZZZZZZZZZZZZZ"), /has an "&" not written "&amp;"/],
  ["an unverified Gumroad slug behind a named reference", "index.html", "</body>",
    '<p><a href="https://notgabriel&period;gumroad.com/l/evilslug">Buy · €1200</a></p>\n</body>',
    /has an "&" not written "&amp;"/],
  // A browser drops the tab and follows the verified id with the query; the
  // PayPal table's text capture stopped at the tab and read only the id. The
  // card count catches it now, before the canonical-spelling rule would.
  ["a verified PayPal NCP id with a query behind a tab", "index.html", "</body>",
    '<p><a class="tool" href="https://www.paypal.com/ncp/payment/3SWZ64EXW9C8W\t?amount=1200"><b>Mastering</b> ' +
      '<span>€45</span></a></p>\n</body>',
    /index\.html has 4 PayPal NCP URL\(s\) but only 3 of them are the href="\.\.\." of an <a> the price check reads/],
  ["an Agensi link to another skill", "index.html", "</body>", payLink("https://agensi.io/skills/another-skill"),
    /goes to agensi\.io\/skills\/another-skill, which is not the reviewed Agensi product page\. agensi\.io may be linked only at \/skills\/claude-code-theme-setup-assistant/],
  ["the Agensi page with a query", "index.html", "</body>",
    payLink("https://agensi.io/skills/claude-code-theme-setup-assistant?ref=shop"),
    /goes to agensi\.io\/skills\/claude-code-theme-setup-assistant\?ref=shop, which is not the reviewed Agensi product page/],
  ["the Agensi page with a fragment", "index.html", "</body>",
    payLink("https://agensi.io/skills/claude-code-theme-setup-assistant#buy"),
    /goes to agensi\.io\/skills\/claude-code-theme-setup-assistant#buy, which is not the reviewed Agensi product page/],
  ["a Gumroad link off the product path", "index.html", "</body>", payLink("https://notgabriel.gumroad.com/x/bqgfv"),
    /goes to notgabriel\.gumroad\.com\/x\/bqgfv, which is not a product page in verifiedGumroadSlugs\. .*its price is only the one the page records/],
  ["a protocol-relative link off the site", "index.html", "</body>", payLink("//pay.example.invalid/b/0"),
    /reaches pay\.example\.invalid, but it does not start with "https:\/\/"/],
  ["a javascript: link", "index.html", "</body>", payLink("javascript:void(0)"), /uses javascript:/],
  ["a link that does not resolve", "index.html", "</body>", payLink("https://[pay"), /is not a URL a browser can resolve/],
  ["an unreviewed host as the second srcset candidate", "index.html", "</body>",
    '<img alt="" srcset="assets/a.png 1x, https://img.example.invalid/b.png 2x">\n</body>',
    /links to img\.example\.invalid, which is not a reviewed link host/],
  ["a form posting to an unreviewed host", "index.html", "</body>",
    '<form action="https://pay.example.invalid/charge"><button>Pay</button></form>\n</body>',
    /index\.html has a <form>, which sends its fields to its action as a query/],
  ["a base element", "index.html", "</head>", '<base href="https://pay.example.invalid/">\n</head>', /index\.html has a <base href>/],
  ["a meta refresh", "index.html", "</head>", '<meta http-equiv="refresh" content="0;url=https://pay.example.invalid/">\n</head>',
    /index\.html has a <meta http-equiv="refresh">/],
  ["Stripe in the README", "README.md", "# 50 dark themes for Claude Code", "# 50 dark themes for Claude Code\n\nPay with Stripe.",
    /README\.md:\d+ contains "Stripe"/],
]) {
  test(`rejects ${defect}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await editPage(t, page, from, to);

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `${defect} shipped green`);
    assert.match(result.stderr, message);
  });
}

for (const [control, page, from, to] of [
  // Every page carries one Content-Security-Policy now; another http-equiv
  // that cannot navigate stays allowed.
  ["a content-language meta", "index.html", "</head>",
    '<meta http-equiv="content-language" content="en">\n</head>'],
  ["a tel: link", "impressum.html", "</body>", '<p><a href="tel:+4930000000">Telefon</a></p>\n</body>'],
  ["a <base> that only sets a target", "index.html", "</head>", '<base target="_blank">\n</head>'],
  // Split on every comma, this URL's second half read as the scheme "h-480:".
  ["a srcset URL with a comma in it", "index.html", "</body>",
    '<img alt="" srcset="https://github.com/notgabriels-sys/tr:w-640,h-480:rt-90/a.png 1x">\n</body>'],
  ["an inline image", "index.html", "</body>", '<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">\n</body>'],
]) {
  test(`accepts ${control}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await editPage(t, page, from, to);

    const result = await runVerifier(fixtureRoot);

    assert.equal(result.code, 0, `${control} was rejected: ${result.stderr}`);
  });
}

// The review of the first version of the link check: each shipped with verify
// green, and Chromium followed each to a payment page.
const card = (href, price) => `<p><a class="tool" href="${href}"><b>Mastering</b><i>View checkout · ${price}</i></a></p>\n</body>`;
for (const [defect, page, from, to, message] of [
  ["a Gumroad path with a line break in it", "index.html", "</body>",
    '<p><a href="https://notgabriel.gumroad.com/\nl/wuhehk">View product <span>€5</span></a></p>\n</body>',
    /reaches notgabriel\.gumroad\.com, but it holds a tab or line break, which a browser removes/],
  ["a Gumroad path with a backslash in it", "index.html", "</body>",
    '<p><a href="https://notgabriel.gumroad.com/l\\wuhehk">View product <span>€5</span></a></p>\n</body>',
    /reaches notgabriel\.gumroad\.com, but a browser normalises it to https:\/\/notgabriel\.gumroad\.com\/l\/wuhehk/],
  ["a Gumroad path with a dot segment", "index.html", "</body>",
    '<p><a href="https://notgabriel.gumroad.com/./l/wuhehk">View product <span>€5</span></a></p>\n</body>',
    /reaches notgabriel\.gumroad\.com, but a browser normalises it to https:\/\/notgabriel\.gumroad\.com\/l\/wuhehk/],
  ["a page that opens with front matter", "index.html", "<!doctype html>", "---\n---\n<!doctype html>",
    /index\.html opens with "---"/],
  ["an image map", "index.html", "</body>",
    '<a href="https://www.paypal.com/ncp/payment/3SWZ64EXW9C8W"><img ismap alt="pay" src="favicon.svg"> €45</a>\n</body>',
    /index\.html has ismap on <img>, which can send the visitor or a request somewhere/],
  ["a formaction", "index.html", "</body>", '<button formaction="impressum.html">Go</button>\n</body>',
    /index\.html has formaction on <button>, which can send the visitor or a request somewhere/],
  ["an event handler", "index.html", "</body>",
    `<p><a href="#" onclick="location.href='https://pay.example.invalid/';return false">Pay €45</a></p>\n</body>`,
    /index\.html has onclick on <a>, which can send the visitor or a request somewhere/],
  ["an attributionsrc", "index.html", "</body>",
    '<img alt="" src="favicon.svg" attributionsrc="https://pay.example.invalid/register">\n</body>',
    /index\.html has attributionsrc on <img>, which can send the visitor or a request somewhere/],
  ["an unreviewed host in a preload imagesrcset", "index.html", "</head>",
    '<link rel="preload" as="image" imagesrcset="https://img.example.invalid/a.png 1x">\n</head>',
    /<link imagesrcset="https:\/\/img\.example\.invalid\/a\.png 1x"> links to img\.example\.invalid/],
  ["a GitHub Sponsors checkout for another account", "index.html", "</body>",
    payLink("https://github.com/sponsors/someone-else"),
    /goes to github\.com\/sponsors\/someone-else, which is not a verified payment object\. github\.com may be linked only under \/notgabriels-sys\//],
  ["a second PayPal card stating another id's price", "index.html", "</body>",
    card("https://www.paypal.com/ncp/payment/QW8V53WWM2P7E", "€45"),
    /PayPal link QW8V53WWM2P7E must charge €190 per the verified rate card; its card on index\.html states €45/],
  ["a PayPal card on another page stating another id's price", "impressum.html", "</body>",
    card("https://www.paypal.com/ncp/payment/QW8V53WWM2P7E", "€45"),
    /PayPal link QW8V53WWM2P7E must charge €190 per the verified rate card; its card on impressum\.html states €45/],
  ["a PayPal card whose href is in single quotes", "index.html", "</body>",
    "<p><a class=\"tool\" href='https://www.paypal.com/ncp/payment/QW8V53WWM2P7E'><b>Mastering</b><i>€45</i></a></p>\n</body>",
    /index\.html has 4 PayPal NCP URL\(s\) but only 3 of them are the href="\.\.\." of an <a> the price check reads/],
  ["an unreviewed host as the second ping", "index.html", "</body>",
    '<p><a href="/" ping="assets/ok https://pay.example.invalid/p">Home</a></p>\n</body>',
    /links to pay\.example\.invalid, which is not a reviewed link host/],
  ["an attribute nobody has checked", "index.html", "</body>",
    '<img alt="" src="favicon.svg" newsrc="https://pay.example.invalid/x">\n</body>',
    /index\.html has newsrc on <img>, an attribute this check does not know/],
  ["a Stripe link on a page outside the root", "assets/social-preview.html", "</body>",
    payLink("https://buy.stripe.com/test_0"), /assets\/social-preview\.html:\d+ contains "stripe"/],
  ["a verified PayPal card on a page the price checks do not read", "assets/social-preview.html", "</body>",
    card("https://www.paypal.com/ncp/payment/3SWZ64EXW9C8W", "€1200"),
    /links to www\.paypal\.com from a page the price checks do not read/],
  ["a srcset URL whose host follows a comma", "index.html", "</body>",
    '<img alt="" srcset="https://github.com,x@img.example.invalid/b.png 1x">\n</body>',
    /links to img\.example\.invalid, which is not a reviewed link host/],
]) {
  test(`rejects ${defect}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await editPage(t, page, from, to);

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `${defect} shipped green`);
    assert.match(result.stderr, message);
  });
}

test("rejects an Agensi sibling host reviewed without a path rule", { timeout: 90_000 }, async (t) => {
  // www.agensi.io serves the same marketplace; listed as an ordinary host, any
  // skill on it would pass.
  const fixtureRoot = await editPage(t, "scripts/verify.mjs", '"www.producthunt.com",', '"www.producthunt.com", "www.agensi.io",');

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an unrestricted www.agensi.io shipped green");
  assert.match(result.stderr, /www\.agensi\.io is a reviewed link host on a payment domain with no entry in paymentPath/);
});

test("rejects a payment-domain host reviewed without a path rule", { timeout: 90_000 }, async (t) => {
  // paypal.me is PayPal's own payment product; listed as an ordinary host, any
  // path on it would pass.
  const fixtureRoot = await editPage(t, "scripts/verify.mjs", '"www.producthunt.com",', '"www.producthunt.com", "paypal.me",');

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an unrestricted paypal.me shipped green");
  assert.match(result.stderr, /paypal\.me is a reviewed link host on a payment domain with no entry in paymentPath/);
});

test("rejects a data: link", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await editPage(t, "index.html", "</body>",
    '<p><a href="data:text/html,%3Ca%20href%3Dhttps://pay.example.invalid%3EPay%3C/a%3E">Pay</a></p>\n</body>');

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a data: link shipped green");
  assert.match(result.stderr, /uses data:\. Links on the site are https:, mailto:, tel: or sms:/);
});

test("accepts a reviewed link whose query is written with &amp;", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await editPage(t, "index.html", "</body>",
    '<p><a href="https://github.com/notgabriels-sys/claude-code-50-dark-themes/issues?q=is%3Aopen&amp;sort=new">Issues</a></p>\n</body>');

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, result.stderr);
});

// Notes: GitHub Pages renders every Markdown file outside a "." or "_"
// directory as a page on the shop's domain. Each of these rendered as a live
// link (Jekyll 3.10.0, kramdown GFM, the Pages default plugins) while verify
// stayed green.
async function addFile(t, path, content) {
  const fixtureRoot = await makeFixture(t);
  await mkdir(dirname(join(fixtureRoot, path)), { recursive: true });
  await writeFile(join(fixtureRoot, path), content);
  return fixtureRoot;
}
for (const [defect, path, content, message] of [
  ["a note linking an unverified PayPal checkout", "PAY_NOTE.md",
    "Book a master: [Mastering · €45](https://www.paypal.com/ncp/payment/ZZZZZZZZZZZZZ)\n",
    /PAY_NOTE\.md:1 \(https:\/\/www\.paypal\.com\/ncp\/payment\/ZZZZZZZZZZZZZ\) links to www\.paypal\.com from a note/],
  ["a note linking the Agensi skill", "PAY_NOTE.md",
    "Get the [assistant](https://agensi.io/skills/claude-code-theme-setup-assistant).\n",
    /PAY_NOTE\.md:1 \(https:\/\/agensi\.io\/skills\/claude-code-theme-setup-assistant\) links to agensi\.io from a note/],
  ["a note autolinking another checkout", "PAY_NOTE.md", "Pay at <https://pay.example.invalid/b/1>.\n",
    /PAY_NOTE\.md:1 \(https:\/\/pay\.example\.invalid\/b\/1\) links to pay\.example\.invalid, which is not a reviewed link host/],
  ["a note with a raw-HTML PayPal.me link", "products/x/NOTE.md", '<a href="https://www.paypal.com/paypalme/someone/1200EUR">Pay</a>\n',
    /products\/x\/NOTE\.md:1 \(https:\/\/www\.paypal\.com\/paypalme\/someone\/1200EUR\) links to www\.paypal\.com from a note/],
  ["a reference definition inside a blockquote", "PAY_NOTE.md", ">    [r]: https://pay.example.invalid/x\n\n[Pay][r]\n",
    /links to pay\.example\.invalid, which is not a reviewed link host/],
  ["a kramdown attribute list that sets href", "PAY_NOTE.md", '[Docs](/ok){: href="https://pay.example.invalid/x"}\n',
    /links to pay\.example\.invalid, which is not a reviewed link host/],
  ["a note link spelled with a character reference", "PAY_NOTE.md", "[Pay](https://pay&#46;example.invalid/x)\n",
    /spells a link with a character reference or a backslash escape/],
  ["a note link spelled with a backslash escape", "PAY_NOTE.md", "[Pay](https://pay\\.example.invalid/x)\n",
    /spells a link with a character reference or a backslash escape/],
  ["a javascript: link in a note", "PAY_NOTE.md", "[Pay](javascript:void(0))\n", /is a javascript: link/],
  ["a note link that does not resolve", "PAY_NOTE.md", "[Pay](https://[pay)\n", /is a link Jekyll would render that no browser can resolve/],
  ["a GitHub Sponsors link in a note", "PAY_NOTE.md", "[Support](https://github.com/sponsors/someone-else)\n",
    /goes to github\.com\/sponsors\/someone-else; github\.com may be linked only under \/notgabriels-sys\//],
  ["a note that sets a permalink", "PAY_NOTE.md", "---\npermalink: /index.html\n---\n\n# Shop\n",
    /PAY_NOTE\.md sets "permalink" in its front matter/],
  ["a note whose front matter does not close", "PAY_NOTE.md", "---\nname: x\n\n# Shop\n",
    /PAY_NOTE\.md opens with "---" but its front matter does not close/],
  ["a Liquid expression in a note", "PAY_NOTE.md", "{{ 'https://pay' | append: '.example.invalid/x' }}\n",
    /PAY_NOTE\.md holds a Liquid delimiter/],
  ["a Jekyll config at the root", "_config.yml", "plugins: [jekyll-redirect-from]\n",
    /_config\.yml changes what GitHub Pages builds/],
]) {
  test(`rejects ${defect}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await addFile(t, path, content);

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `${defect} shipped green`);
    assert.match(result.stderr, message);
  });
}

for (const [control, path, content] of [
  // kramdown renders a bare URL as text, not a link.
  ["a bare URL in a note's prose", "PAY_NOTE.md", "See https://pay.example.invalid/x for the details.\n"],
  // Pages does not serve files under a "." directory.
  ["a link in a note Pages does not serve", ".github/PAY_NOTE.md", "[Pay](https://pay.example.invalid/x)\n"],
]) {
  test(`accepts ${control}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await addFile(t, path, content);

    const result = await runVerifier(fixtureRoot);

    assert.equal(result.code, 0, `${control} was rejected: ${result.stderr}`);
  });
}

// Pages serves every file outside a "." or "_" directory, and a browser opens
// some types as documents that the page and note checks never read.
const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">';
const SITEMAP_OPEN = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
for (const [defect, path, content, message] of [
  ["a page saved as .htm", "pay.htm", '<!doctype html><a href="https://pay.example.invalid/x">Pay</a>\n',
    /pay\.htm sits where GitHub Pages serves files, and verify does not read a \.htm file/],
  ["a page saved as .xhtml", "assets/pay.xhtml",
    '<html xmlns="http://www.w3.org/1999/xhtml"><body><a href="https://pay.example.invalid/x">Pay</a></body></html>\n',
    /assets\/pay\.xhtml sits where GitHub Pages serves files, and verify does not read a \.xhtml file/],
  ["a page saved with an uppercase extension", "pay.HTML", '<!doctype html><a href="https://pay.example.invalid/x">Pay</a>\n',
    /pay\.HTML sits where GitHub Pages serves files, and verify does not read a \.HTML file/],
  ["a note Jekyll renders from .markdown", "PAY_NOTE.markdown", "[Pay](https://pay.example.invalid/x)\n",
    /PAY_NOTE\.markdown sits where GitHub Pages serves files, and verify does not read a \.markdown file/],
  ["a served file of an unreviewed type", "assets/pay.pdf", "%PDF-1.4\n",
    /assets\/pay\.pdf sits where GitHub Pages serves files, and verify does not read a \.pdf file/],
  ["an SVG holding a link", "assets/pay.svg", `${SVG_OPEN}\n<a href="https://pay.example.invalid/x"><text y="9">Pay</text></a>\n</svg>\n`,
    /assets\/pay\.svg:2 has the element <a>, which is not in the SVG artwork allowlist/],
  ["an SVG holding a script", "assets/pay.svg", `${SVG_OPEN}<script>location.assign("https://pay.example.invalid/x")</script></svg>\n`,
    /assets\/pay\.svg:1 has the element <script>, which is not in the SVG artwork allowlist/],
  // Chromium runs this one: the prefix is bound to the SVG namespace, and a
  // name read with a character class would stop at the "ä". The scripts hold
  // no "=" of their own; "xmlns:ä=" is refused by the attribute allowlist too,
  // and the next-but-one test pins that capture alone.
  ["an SVG holding a script under a non-ASCII prefix", "assets/pay.svg",
    `${SVG_OPEN}<ä:script xmlns:ä="http://www.w3.org/2000/svg">location.assign("https://pay.example.invalid/x")</ä:script></svg>\n`,
    /assets\/pay\.svg:1 has the element <ä:script>, which is not in the SVG artwork allowlist/],
  ["an SVG with an event handler", "assets/pay.svg", `${SVG_OPEN}<rect width="9" height="9" onclick="location = 'x'"/></svg>\n`,
    /assets\/pay\.svg:1 has the attribute onclick=, which is not in the SVG artwork allowlist/],
  // Chromium fetches a paint server in another file when the SVG is opened.
  ["an SVG whose fill fetches another file", "assets/pay.svg",
    `${SVG_OPEN}<rect width="9" height="9" fill="url(https://pay.example.invalid/p.svg#g)"/></svg>\n`,
    /assets\/pay\.svg:1 has "url\("\. A url\(\) may only name an element in this file/],
  // CSS reads "\75" as "u", so this is url( too.
  ["an SVG spelling url( with a CSS escape", "assets/pay.svg",
    `${SVG_OPEN}<rect width="9" height="9" fill="\\75rl(https://pay.example.invalid/p.svg#g)"/></svg>\n`,
    /assets\/pay\.svg:1 has "\\"\. A url\(\) may only name an element in this file/],
  ["an SVG in the XHTML namespace", "assets/pay.svg", '<svg xmlns="http://www.w3.org/1999/xhtml"><rect width="9"/></svg>\n',
    /assets\/pay\.svg:1 has xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"; it must be http:\/\/www\.w3\.org\/2000\/svg/],
  ["an SVG with a doctype that declares markup", "assets/pay.svg",
    `<!DOCTYPE svg [<!ENTITY pay "<a href='https://pay.example.invalid/x'>Pay</a>">]>\n${SVG_OPEN}&pay;</svg>\n`,
    /assets\/pay\.svg:1 has "<!"\. A doctype, CDATA section/],
  ["an SVG with a character reference", "assets/pay.svg", `${SVG_OPEN}<text>&#60;</text></svg>\n`,
    /assets\/pay\.svg:1 has "&"\. A doctype, CDATA section/],
  ["an SVG saved as UTF-16", "assets/pay.svg",
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${SVG_OPEN}<rect width="9"/></svg>\n`, "utf16le")]),
    /assets\/pay\.svg is not UTF-8/],
  ["an SVG that opens with front matter", "assets/pay.svg", `---\n---\n${SVG_OPEN}<rect width="9"/></svg>\n`,
    /assets\/pay\.svg opens with "---"\. Jekyll runs any file with front matter through Liquid/],
  ["a sitemap styled into a page", "sitemap.xml",
    SITEMAP_OPEN.replace("\n", '\n<?xml-stylesheet type="text/xsl" href="sitemap.xsl"?>\n') +
      "  <url><loc>https://gabs-utilities.com/</loc></url>\n</urlset>\n",
    /sitemap\.xml:2 has "<\?"\. A doctype, CDATA section, processing instruction/],
  ["an XHTML page saved as .xml", "assets/pay.xml",
    '<html xmlns="http://www.w3.org/1999/xhtml"><body><a href="https://pay.example.invalid/x">Pay</a></body></html>\n',
    /assets\/pay\.xml:1 has the element <html>, which is not in the sitemap allowlist/],
  ["a sitemap listing a page off the site", "sitemap.xml",
    `${SITEMAP_OPEN}  <url><loc>https://pay.example.invalid/x</loc></url>\n</urlset>\n`,
    /sitemap\.xml lists https:\/\/pay\.example\.invalid\/x; a sitemap lists pages on https:\/\/gabs-utilities\.com\//],
  ["a sitemap location verify cannot read", "sitemap.xml",
    `${SITEMAP_OPEN}  <url><loc >https://pay.example.invalid/x</loc></url>\n</urlset>\n`,
    /sitemap\.xml has a <loc> verify cannot read/],
]) {
  test(`rejects ${defect}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await addFile(t, path, content);

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `${defect} shipped green`);
    assert.match(result.stderr, message);
  });
}

test("rejects a symlink Pages serves", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // To a plain-text file, so only the symlink branch can catch it.
  await symlink("../llms.txt", join(fixtureRoot, "assets", "pay.txt"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a served symlink shipped green");
  assert.match(result.stderr, /assets\/pay\.txt is a symlink\. Jekyll publishes what a link points at/);
});

for (const [control, path, content] of [
  // text/plain: a browser shows the markup as text.
  ["a link in a served text file", "assets/pay.txt", '<a href="https://pay.example.invalid/x">Pay</a>\n'],
  // Pages does not serve files under a "." directory.
  ["a page of an unreviewed type Pages does not serve", ".github/pay.htm", '<a href="https://pay.example.invalid/x">Pay</a>\n'],
  ["an SVG using the declaration, predefined entities and every allowlisted shape", "assets/shapes.svg",
    `<?xml version="1.0" encoding="UTF-8"?>\n${SVG_OPEN}\n<title>R&amp;B &lt;3</title>\n` +
      '<defs><radialGradient id="r" fx="0.5" fy="0.5" gradientUnits="objectBoundingBox"><stop offset="0" stop-opacity="1"/>' +
      '</radialGradient></defs>\n<ellipse cx="9" cy="9" rx="4" ry="2" fill="url(#r)" fill-rule="evenodd"/>\n' +
      '<polyline points="0,0 9,9" stroke-dasharray="2"/><polygon points="0,0 9,0 9,9"/>\n' +
      '<text x="1" y="9"><tspan>ok</tspan></text>\n<desc>Shapes</desc><rect width="1" height="1"/><circle r="1"/>' +
      '<line x1="0" y1="0" x2="1" y2="1"/><path d="M0 0H1"/>\n</svg>\n'],
]) {
  test(`accepts ${control}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await addFile(t, path, content);

    const result = await runVerifier(fixtureRoot);

    assert.equal(result.code, 0, `${control} was rejected: ${result.stderr}`);
  });
}

// Found by the review of the served-file check: what Jekyll publishes under a
// dot name, what a script can become, and what a page without a doctype loads.
for (const [defect, path, content, message] of [
  // Jekyll's default include, ".htaccess", is a prefix match on any name.
  ["an SVG published under a .htaccess name", ".htaccess.svg",
    `${SVG_OPEN}<a href="https://pay.example.invalid/x"><text y="9">Pay</text></a></svg>\n`,
    /\.htaccess\.svg is published by GitHub Pages: Jekyll's default include, "\.htaccess", matches any name/],
  ["a note in a directory published under a .htaccess name", "assets/.htaccess-shop/pay.md",
    "[Pay](https://pay.example.invalid/x)\n",
    /assets\/\.htaccess-shop(\/pay\.md)? is published by GitHub Pages: Jekyll's default include/],
  // Registered from an inline script, a worker at the root controls every page.
  ["a script where a service worker would control the storefront", "sw.mjs",
    'self.addEventListener("fetch", (event) => event.respondWith(fetch("https://pay.example.invalid/x")));\n',
    /sw\.mjs is a script in a directory at or above claude-code-theme-install-guide\.html\. Registered as a service worker/],
  ["a script beside a page in a subdirectory", "assets/sw.mjs", "self.skipWaiting();\n",
    /assets\/sw\.mjs is a script in a directory at or above assets\/social-preview\.html/],
  ["a page in quirks mode", "assets/plain.html", '<title>Plain</title><link rel="stylesheet" href="../llms.txt">\n',
    /assets\/plain\.html must open with <!doctype html>/],
  ["an SVG with no namespace", "assets/plain.svg", '<svg viewBox="0 0 9 9"><rect width="9" height="9"/></svg>\n',
    /assets\/plain\.svg must open with <svg xmlns="http:\/\/www\.w3\.org\/2000\/svg">/],
  ["a sitemap with no namespace", "sitemap.xml",
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n  <url><loc>https://gabs-utilities.com/</loc></url>\n</urlset>\n',
    /sitemap\.xml must open with <urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/],
]) {
  test(`rejects ${defect}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await addFile(t, path, content);

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `${defect} shipped green`);
    assert.match(result.stderr, message);
  });
}

for (const [control, path, content] of [
  // Jekyll never enters .github, so the include prefix does not reach this.
  ["a .htaccess name inside a directory Pages does not serve", ".github/.htaccess.svg",
    `${SVG_OPEN}<a href="https://pay.example.invalid/x"><text y="9">Pay</text></a></svg>\n`],
  // A worker's scope is its own directory, and scripts/ holds no page.
  ["a script in a directory that holds no page", "scripts/sw.mjs", "self.skipWaiting();\n"],
]) {
  test(`accepts ${control}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await addFile(t, path, content);

    const result = await runVerifier(fixtureRoot);

    assert.equal(result.code, 0, `${control} was rejected: ${result.stderr}`);
  });
}

// Found by the records review of the served-file check: what a note's raw
// HTML or a subdirectory page can run, and branches no test pinned.
for (const [defect, path, content, message] of [
  ["a script element in a note", "PAY_NOTE.md", '# Pay\n\n<script>location.assign("https://pay.example.invalid/x")</script>\n',
    /PAY_NOTE\.md:3 has "<script", which can run script or load another page from the note Pages renders/],
  ["an event handler in a note", "PAY_NOTE.md", "# Pay\n\n<img src=\"pay.png\" alt=\"\" onerror=\"location.assign('https://pay.example.invalid/x')\">\n",
    /PAY_NOTE\.md:3 has "onerror=", which can run script/],
  ["a meta refresh in a note", "PAY_NOTE.md", '# Pay\n\n<meta http-equiv="refresh" content="0;url=https://pay.example.invalid/x">\n',
    /PAY_NOTE\.md:3 has "<meta", which can run script/],
  ["an iframe in a note", "PAY_NOTE.md",
    "# Pay\n\n<iframe srcdoc=\"&lt;script&gt;top.location.assign('https://pay.example.invalid/x')&lt;/script&gt;\"></iframe>\n",
    /PAY_NOTE\.md:3 has "<iframe", which can run script/],
  // kramdown's attribute list puts the handler on the paragraph.
  ["a handler set by a kramdown attribute list", "PAY_NOTE.md",
    "# Pay\n\nPay now\n{: onclick=\"location.assign('https://pay.example.invalid/x')\"}\n",
    /PAY_NOTE\.md:4 has "onclick=", which can run script/],
  ["a script loaded by src on a page in a subdirectory", "assets/promo.html",
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Promo</title></head>\n' +
      '<body><p>Promo</p><script src="../scripts/sync-plugin-themes.mjs"></script></body></html>\n',
    /assets\/promo\.html:\d+ has a script tag spelled "<script src=\\"\.\.\/scripts\/sync-plugin-themes\.mjs\\">"\. Only <script type="application\/ld\+json"> and <script> are allowed: a src loads code from a file verify does not read/],
  ["an SVG spelling url( in capitals", "assets/pay.svg",
    `${SVG_OPEN}<rect width="9" height="9" fill="URL(https://pay.example.invalid/p.svg#g)"/></svg>\n`,
    /assets\/pay\.svg:1 has "URL\("\. A url\(\) may only name an element in this file/],
  // Only the attribute capture can catch this: the element is allowlisted, and
  // a name read with a character class stops at the "ä".
  ["an SVG attribute name ending in a non-ASCII letter", "assets/pay.svg",
    `${SVG_OPEN}<rect width="9" xmlns:ä="http://www.w3.org/2000/svg"/></svg>\n`,
    /assets\/pay\.svg:1 has the attribute xmlns:ä=, which is not in the SVG artwork allowlist/],
  ["a sitemap opening with a stylesheet", "sitemap.xml",
    '<?xml-stylesheet type="text/css" href="https://pay.example.invalid/s.css"?>\n' +
      SITEMAP_OPEN.slice(SITEMAP_OPEN.indexOf("\n") + 1) + "  <url><loc>https://gabs-utilities.com/</loc></url>\n</urlset>\n",
    /sitemap\.xml:1 has "<\?"\. A doctype, CDATA section, processing instruction/],
  ["a sitemap declaring another encoding", "sitemap.xml",
    '<?xml version="1.0" encoding="ISO-8859-1"?>\n' +
      SITEMAP_OPEN.slice(SITEMAP_OPEN.indexOf("\n") + 1) + "  <url><loc>https://gabs-utilities.com/</loc></url>\n</urlset>\n",
    /sitemap\.xml:1 has "<\?"\. A doctype, CDATA section, processing instruction/],
  ["a sitemap location not written as a browser writes it", "sitemap.xml",
    `${SITEMAP_OPEN}  <url><loc>https://gabs-utilities.com/a/../impressum.html</loc></url>\n</urlset>\n`,
    /sitemap\.xml lists https:\/\/gabs-utilities\.com\/a\/\.\.\/impressum\.html; a sitemap lists pages on/],
]) {
  test(`rejects ${defect}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await addFile(t, path, content);

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `${defect} shipped green`);
    assert.match(result.stderr, message);
  });
}

for (const [control, path, content] of [
  // Jekyll skips a "_" directory at any depth, as it does a "." one.
  ["a page of an unreviewed type under a nested underscore directory", "assets/_drafts/pay.htm",
    '<a href="https://pay.example.invalid/x">Pay</a>\n'],
  // A name HTML does not know is an inert element; notes write placeholders.
  ["placeholders written as tags in a note", "PAY_NOTE.md",
    "Read the link at paypal.com/ncp/links/<ID> and put <name> on the invoice.\n"],
]) {
  test(`accepts ${control}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await addFile(t, path, content);

    const result = await runVerifier(fixtureRoot);

    assert.equal(result.code, 0, `${control} was rejected: ${result.stderr}`);
  });
}

// Found by the false-refusals review: what git ignores, ordinary images and
// declarations, a stylesheet, and a note's title.
const inRepository = async (t) => {
  const fixtureRoot = await makeFixture(t);
  execFileSync("git", ["init", "-q"], { cwd: fixtureRoot });
  return fixtureRoot;
};
test("accepts a generated file git ignores, in a repository", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await inRepository(t);
  // products/*/pack/ is in .gitignore: what a product's generator writes.
  await mkdir(join(fixtureRoot, "products", "raw-techno-kicks", "pack", "01_Deep"), { recursive: true });
  await writeFile(join(fixtureRoot, "products", "raw-techno-kicks", "pack", "01_Deep", "kick.wav"), "RIFF");

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `an ignored file was read as served: ${result.stderr}`);
});

test("rejects an untracked page of an unreviewed type, in a repository", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await inRepository(t);
  await writeFile(join(fixtureRoot, "pay.htm"), '<a href="https://pay.example.invalid/x">Pay</a>\n');

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an untracked .htm page shipped green");
  assert.match(result.stderr, /pay\.htm sits where GitHub Pages serves files, and verify does not read a \.htm file/);
});

test("rejects a stylesheet, which a page could load", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await addFile(t, "assets/site.css", '@import "https://pay.example.invalid/x.css";\n');

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a stylesheet shipped green");
  assert.match(result.stderr, /assets\/site\.css is a stylesheet\. A page here may load one, and CSS makes requests/);
});

for (const [control, path, content] of [
  ["an image whose extension is in capitals", "assets/products/IMG_0001.JPG", "not really a jpeg\n"],
  ["an audio preview", "assets/audio/kick-preview.mp3", "ID3\n"],
  ["an SVG declaring itself standalone", "assets/plain.svg",
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${SVG_OPEN}<rect width="9" height="9"/></svg>\n`],
  ["a note with a title in its front matter", "docs/PALETTE_NOTES.md", "---\ntitle: Palette notes\ndescription: How the palettes were tuned.\n---\n\nNotes.\n"],
]) {
  test(`accepts ${control}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await addFile(t, path, content);

    const result = await runVerifier(fixtureRoot);

    assert.equal(result.code, 0, `${control} was rejected: ${result.stderr}`);
  });
}

test("reads a sitemap declaration in single quotes and lower case as well-formed", { timeout: 90_000 }, async (t) => {
  // scripts/build-theme-pages.mjs owns sitemap.xml, so any other bytes are
  // stale. The freshness check runs after the sitemap's document checks, so
  // reaching it shows the reader accepted this declaration.
  const fixtureRoot = await editPage(
    t,
    "sitemap.xml",
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<?xml version='1.0' encoding='utf-8'?>",
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a sitemap the builder did not write shipped green");
  assert.match(result.stderr, /sitemap\.xml is stale/);
});

test("accepts a tracked file deleted from the working tree, in a repository", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await inRepository(t);
  // git still lists it, but nothing is there to serve.
  await writeFile(join(fixtureRoot, "gone.txt"), "soon gone\n");
  execFileSync("git", ["add", "gone.txt"], { cwd: fixtureRoot });
  await rm(join(fixtureRoot, "gone.txt"));

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a deleted file stopped verify: ${result.stderr}`);
});

// Inline scripts are reviewed by hash, and each page's Content-Security-Policy
// names exactly those hashes, so the browser runs nothing else.
const POLICY_NONE = "script-src 'none'; worker-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const policyMeta = (content) => `<meta http-equiv="Content-Security-Policy" content="${content}">`;
for (const [defect, page, from, to, message] of [
  ["a line added to the gallery script", "index.html", 'const grid = document.getElementById("grid");',
    'location.assign("https://pay.example.invalid/x");\nconst grid = document.getElementById("grid");',
    /index\.html runs an inline script nobody has reviewed \(sha256-[A-Za-z0-9+/]+=*\)\. A script can navigate or load without a link, so read it first; then replace sha256-[A-Za-z0-9+/]+=* with it in reviewedInlineScripts for index\.html[\s\S]*use this Content-Security-Policy: <meta http-equiv/],
  ["a second inline script", "impressum.html", "</body>",
    '<script>location.assign("https://pay.example.invalid/x")</script>\n</body>',
    /impressum\.html runs an inline script nobody has reviewed/],
  ["a page without its Content-Security-Policy", "impressum.html", `  ${policyMeta(POLICY_NONE)}\n`, "",
    /impressum\.html carries 0 Content-Security-Policy metas; it must carry exactly one/],
  ["a page in a subdirectory without its Content-Security-Policy", "assets/social-preview.html", `${policyMeta(POLICY_NONE)}\n`, "",
    /assets\/social-preview\.html carries 0 Content-Security-Policy metas; it must carry exactly one/],
  ["a policy that lets any inline script run", "impressum.html", policyMeta(POLICY_NONE),
    policyMeta(POLICY_NONE.replace("script-src 'none'", "script-src 'unsafe-inline'")),
    /impressum\.html's Content-Security-Policy must read exactly, on one line, with the hashes in page order/],
  // A policy applies only to what follows it.
  ["a policy placed after the head's other tags", "impressum.html", `  ${policyMeta(POLICY_NONE)}\n`, "",
    /impressum\.html's Content-Security-Policy must come right after <meta charset>, with only whitespace between; <meta> comes before it/],
  // Spelled in lower case, as Chromium still applies it.
  ["a second policy", "impressum.html", "</head>", `<meta http-equiv="content-security-policy" content="img-src 'self'">\n</head>`,
    /impressum\.html carries 2 Content-Security-Policy metas; it must carry exactly one/],
  // Anything but whitespace there ends the head in a browser, and a policy in
  // the body is ignored: Chromium then runs an unreviewed script.
  ["a stray character before the policy", "impressum.html", '<meta charset="utf-8">\n', '<meta charset="utf-8">>\n',
    /impressum\.html's Content-Security-Policy must come right after <meta charset>, with only whitespace between; the text ">" comes before it/],
  ["an invisible space before the policy", "impressum.html", `  ${policyMeta(POLICY_NONE)}`, `  \u00a0${policyMeta(POLICY_NONE)}`,
    /impressum\.html's Content-Security-Policy must come right after <meta charset>, with only whitespace between; the text "\\u00a0" comes before it/],
  // A tag that cannot sit in the head starts the body, with no text needed.
  ["a body tag before the policy", "impressum.html", '<meta charset="utf-8">\n', '<meta charset="utf-8"><br>\n',
    /impressum\.html's Content-Security-Policy must come right after <meta charset>, with only whitespace between; <br> comes before it/],
  ["an end tag before the policy", "impressum.html", '<meta charset="utf-8">\n', '<meta charset="utf-8">\n</html>\n',
    /impressum\.html's Content-Security-Policy must come right after <meta charset>, with only whitespace between; <\/html> comes before it/],
  // A browser reads the first of two http-equiv attributes, so this meta
  // applies no policy at all.
  ["a second http-equiv in front of the policy", "impressum.html", policyMeta(POLICY_NONE),
    `<meta http-equiv="content-language" http-equiv="Content-Security-Policy" content="${POLICY_NONE}">`,
    /impressum\.html writes http-equiv twice on one <meta>\. A browser keeps the first and drops the rest/],
]) {
  test(`rejects ${defect}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await editPage(t, page, from, to);
    if (defect.includes("placed after")) {
      const path = join(fixtureRoot, page);
      const markup = await readFile(path, "utf8");
      assert.equal(markup.split("</head>").length, 2);
      await writeFile(path, markup.replace("</head>", `  ${policyMeta(POLICY_NONE)}\n</head>`));
    }

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `${defect} shipped green`);
    assert.match(result.stderr, message);
  });
}

test("rejects a reviewed script hash for a page that no longer runs it", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const verifyPath = join(fixtureRoot, "scripts", "verify.mjs");
  const source = await readFile(verifyPath, "utf8");
  const anchor = "const reviewedInlineScripts = new Map([";
  assert.equal(source.split(anchor).length, 2);
  await writeFile(verifyPath, source.replace(anchor, `${anchor}\n  ["impressum.html", ["sha256-AAAA"]],`));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a stale reviewed hash shipped green");
  assert.match(result.stderr, /reviewedInlineScripts lists sha256-AAAA for impressum\.html, which no longer runs it/);
});

test("accepts the policy with its attributes in the other order", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await editPage(t, "impressum.html", policyMeta(POLICY_NONE),
    `<meta content="${POLICY_NONE}" http-equiv="Content-Security-Policy">`);

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a reordered policy was rejected: ${result.stderr}`);
});

// A lone CR is a line break to a browser too: Chromium ran this script under
// the hash of its text with the CR read as LF.
test("accepts a second script holding a lone CR, reviewed under its LF hash", { timeout: 90_000 }, async (t) => {
  const text = 'document.documentElement.dataset.second = "ran";\rconsole.log("second ran");';
  const fixtureRoot = await editPage(t, "index.html", "</body>", `<script>${text}</script>\n</body>`);
  await reviewScript(fixtureRoot, "index.html", text.replace("\r", "\n"));

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a script with a lone CR was rejected: ${result.stderr}`);
});

// The rules that keep htmlTags reading what a browser builds hold on every
// served page. On assets/social-preview.html each of these once shipped green.
for (const [defect, page, to, message] of [
  ["an inline <svg>", "assets/social-preview.html", '<svg><title>x</title></svg>',
    /assets\/social-preview\.html has an inline <svg>/],
  ['"<!--" in a script', "assets/social-preview.html",
    '<script type="application/ld+json">{"@context":"https://schema.org","name":"<!--"}</script>',
    /assets\/social-preview\.html has a <script> whose text holds "<!--"/],
  ["a <noscript>", "assets/social-preview.html", "<noscript><p>x</p></noscript>",
    /assets\/social-preview\.html:\d+ uses <noscript>/],
  ["a script tag spelled another way", "assets/social-preview.html", "<script  ></script>",
    /assets\/social-preview\.html:\d+ has a script tag spelled "<script  >"/],
  ["microdata", "assets/social-preview.html", "<div itemscope></div>",
    /assets\/social-preview\.html carries microdata or RDFa \("itemscope" on <div>\)/],
  ["an attribute written twice", "assets/social-preview.html", '<a href="#top" href="https://example.invalid/">x</a>',
    /assets\/social-preview\.html writes href twice on one <a>/],
  ["an inline script nobody reviewed", "assets/social-preview.html", '<script>location.assign("https://pay.example.invalid/x")</script>',
    /assets\/social-preview\.html runs an inline script nobody has reviewed/],
  ["a NUL character", "impressum.html", "\u0000",
    /impressum\.html:\d+ holds a NUL character \(U\+0000\)\. A browser reads it as U\+FFFD/],
]) {
  test(`rejects ${defect} on any served page`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await editPage(t, page, "</body>", `${to}\n</body>`);

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `${defect} on ${page} shipped green`);
    assert.match(result.stderr, message);
  });
}

// The inert-element and script-spelling checks read the raw page, so a mention
// in a comment counts. The message names the line and the way to write it.
for (const [mention, comment, message] of [
  ["an inert element", "<!-- old <noscript> fallback removed -->", "uses <noscript>, which can hide structured data"],
  ["a script with a src", '<!-- <script src="old.js"></script> -->', 'has a script tag spelled "<script src=\\\\"old\\.js\\\\">"'],
  ["a misspelled script end tag", "<!-- </script > -->", 'closes a script with "<\\/script >"'],
]) {
  test(`rejects ${mention} named in a comment, and says where and how to quote it`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await editPage(t, "impressum.html", "</body>", `${comment}\n</body>`);
    const markup = await readFile(join(fixtureRoot, "impressum.html"), "utf8");
    const line = markup.slice(0, markup.indexOf(comment)).split("\n").length;

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `${mention} in a comment shipped green`);
    assert.match(result.stderr, new RegExp(`impressum\\.html:${line} ${message}`));
    assert.match(result.stderr, /comments, attribute values and CSS included, so a mention counts too: write its "<" as &lt; or name the element in words/);
  });
}

test("accepts an inert element quoted as &lt;noscript> in a comment", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await editPage(t, "impressum.html", "</body>", "<!-- old &lt;noscript> fallback removed -->\n</body>");

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a quoted mention was refused: ${result.stderr}`);
});

// A browser turns CRLF into LF before it hashes a script, and runs this one
// under the LF hash (checked in Chromium), so verify must hash it the same way.
test("accepts the gallery script saved with CRLF line endings", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const path = join(fixtureRoot, "index.html");
  const markup = await readFile(path, "utf8");
  const start = markup.indexOf("<script>\n");
  assert.equal(markup.split("<script>\n").length, 2);
  const end = markup.indexOf("</script>", start);
  const body = markup.slice(start + "<script>".length, end);
  await writeFile(path, markup.slice(0, start + "<script>".length) + body.replaceAll("\n", "\r\n") + markup.slice(end));

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a CRLF gallery script was rejected: ${result.stderr}`);
});

// The SVG allowlist holds what design tools export, written here in each
// tool's documented shape, and still nothing that links, loads or runs script.
const ILLUSTRATOR_PROLOG = '<?xml version="1.0" encoding="utf-8"?>\n' +
  "<!-- Generator: Adobe Illustrator 27.0.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->\n" +
  '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n';
for (const [control, path, content] of [
  ["an SVG with a clip path and a drop shadow, as Figma exports one", "assets/figma.svg",
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">\n' +
      '<g clip-path="url(#a)" filter="url(#b)"><path d="M2 2h20v20H2z" fill="#111"/></g>\n<defs>\n' +
      '<clipPath id="a"><rect width="24" height="24" fill="white"/></clipPath>\n' +
      '<filter id="b" x="0" y="0" width="24" height="28" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">' +
      '<feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" ' +
      'values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dy="4"/>' +
      '<feGaussianBlur stdDeviation="2"/><feComposite in2="hardAlpha" operator="out"/>' +
      '<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow"/></filter>\n</defs>\n</svg>\n'],
  ["an Illustrator export with its comment, doctype and layer names", "assets/illustrator.svg",
    ILLUSTRATOR_PROLOG + '<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" ' +
      'xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 24 24" ' +
      'enable-background="new 0 0 24 24" xml:space="preserve">\n' +
      '<g data-name="Layer 1"><rect class="st0" width="24" height="24" fill="#111"/></g>\n</svg>\n'],
  ["a potrace export with the SVG 1.0 doctype and its metadata", "assets/potrace.svg",
    '<?xml version="1.0" standalone="no"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 20010904//EN"\n' +
      ' "http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd">\n' +
      '<svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="64pt" height="64pt" viewBox="0 0 64 64">\n' +
      "<metadata>\nCreated by potrace 1.14\n</metadata>\n" +
      '<g transform="translate(0,64) scale(0.1,-0.1)" fill="#000000" stroke="none"><path d="M150 590 l0 -160z"/></g>\n</svg>\n'],
]) {
  test(`accepts ${control}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await addFile(t, path, content);

    const result = await runVerifier(fixtureRoot);

    assert.equal(result.code, 0, `${control} was rejected: ${result.stderr}`);
  });
}

for (const [defect, path, content, message] of [
  // An internal subset can declare entities and default attributes, an onload
  // among them, so the public doctype is allowed only exactly as tools write it.
  ["an allowed doctype carrying an internal subset", "assets/pay.svg",
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" ' +
      `[<!ATTLIST svg onload CDATA "location.assign('https://pay.example.invalid/x')">]>\n${SVG_OPEN}<rect width="9"/></svg>\n`,
    /assets\/pay\.svg:1 has "<!"\. A doctype, CDATA section, processing instruction or character reference/],
  ["a filter that loads an image", "assets/pay.svg",
    `${SVG_OPEN}<filter id="f"><feImage href="#x"/></filter><rect filter="url(#f)" width="9" height="9"/></svg>\n`,
    /assets\/pay\.svg:1 has the element <feImage>, which is not in the SVG artwork allowlist/],
  ["the xlink prefix bound to another namespace", "assets/pay.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xhtml" viewBox="0 0 9 9"><rect width="9"/></svg>\n',
    /assets\/pay\.svg:1 has xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xhtml"; it must be http:\/\/www\.w3\.org\/1999\/xlink/],
  // CSS fetches through @import and image-set() without writing url().
  ["a style attribute in an SVG", "assets/pay.svg", `${SVG_OPEN}<rect style="fill:#111" width="9"/></svg>\n`,
    /assets\/pay\.svg:1 has the attribute style=, which is not in the SVG artwork allowlist[\s\S]*Illustrator: export with Styling set to Presentation Attributes/],
]) {
  test(`rejects ${defect}`, { timeout: 90_000 }, async (t) => {
    const fixtureRoot = await addFile(t, path, content);

    const result = await runVerifier(fixtureRoot);

    assert.notEqual(result.code, 0, `${defect} shipped green`);
    assert.match(result.stderr, message);
  });
}

test("lists every construct an SVG must change in one run", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await addFile(t, "assets/pay.svg",
    `${SVG_OPEN}<style>rect{fill:#111}</style>\n<use href="#a"/>\n<use href="#b"/>\n</svg>\n`);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an SVG with a style element and use shipped green");
  assert.match(result.stderr, /assets\/pay\.svg:1 has the element <style>[\s\S]*assets\/pay\.svg:2 has the element <use>/);
  assert.equal(result.stderr.split("has the element <use>").length, 2, "a repeated construct is listed once");
});

test("rejects an SVG whose root is not svg", { timeout: 90_000 }, async (t) => {
  // Only comments and an allowed doctype may come before the root.
  const fixtureRoot = await addFile(t, "assets/pay.svg",
    '<g xmlns="http://www.w3.org/2000/svg"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"/></g>\n');

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "an SVG rooted in a <g> shipped green");
  assert.match(result.stderr, /assets\/pay\.svg must open with <svg xmlns="http:\/\/www\.w3\.org\/2000\/svg">/);
});
