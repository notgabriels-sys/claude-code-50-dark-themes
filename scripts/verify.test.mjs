import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, cp, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

// The numbers the public pages state move whenever a theme is added. Tests
// that edit those claims start from today's real values, so following
// CONTRIBUTING's add-a-theme step leaves them green.
const { roleAwareComparisonCount, indicatorTextBelowAA } = await import("./verify-contrast.mjs");
const vol2Count = (await readdir(join(projectRoot, "plugins/dark-themes-vol-2/themes"))).filter((file) => file.endsWith(".json")).length;
const themeTotal = 50 + vol2Count;
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
  const stale = roleAwareComparisonCount - 168;
  const claim = `<b>${roleAwareComparisonCount}</b> role-aware`;
  assert.ok(card.includes(claim), "fixture anchor moved; update this test");
  await writeFile(fixtureCard, card.replace(claim, `<b>${stale}</b> role-aware`));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a share card claiming a stale check count");
  assert.match(result.stderr, new RegExp(`assets/social-preview\\.html claims ${stale} role-aware checks`));
});

test("rejects a storefront proofline that states a stale check count", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureHtml = join(fixtureRoot, "index.html");
  const html = await readFile(fixtureHtml, "utf8");
  // The number and the phrase are split by markup here; the guard must still
  // read it, because this is the surface that shipped stale before.
  const stale = roleAwareComparisonCount + 6;
  const claim = `<dt>${roleAwareComparisonCount}</dt>`;
  assert.ok(html.includes(claim), "fixture anchor moved; update this test");
  await writeFile(fixtureHtml, html.replace(claim, `<dt>${stale}</dt>`));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a proofline claiming a stale check count");
  assert.match(result.stderr, new RegExp(`index\\.html claims ${stale} role-aware checks`));
});

test("rejects a share card whose theme counts drift from the shipped packs", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureCard = join(fixtureRoot, "assets/social-preview.html");
  const card = await readFile(fixtureCard, "utf8");
  const claim = `<b>50 + ${vol2Count}</b> themes`;
  assert.ok(card.includes(claim), "fixture anchor moved; update this test");
  await writeFile(fixtureCard, card.replace(claim, `<b>50 + ${vol2Count + 2}</b> themes`));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a share card overstating the theme count");
  assert.match(result.stderr, new RegExp(`claims 50 \\+ ${vol2Count + 2} themes; the repository ships 50 \\+ ${vol2Count}`));
});

test("rejects a share card that drops its check-count claim entirely", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureCard = join(fixtureRoot, "assets/social-preview.html");
  const card = await readFile(fixtureCard, "utf8");
  const claim = `<b>${roleAwareComparisonCount}</b> role-aware checks`;
  assert.ok(card.includes(claim), "fixture anchor moved; update this test");
  await writeFile(fixtureCard, card.replace(claim, "<b>MIT</b> licensed"));

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
      "Title card: 50 dark themes for Claude Code, with the plugin install command and a strip of the site&#39;s interface colors",
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

test("rejects gallery cards that copy /theme with a theme argument", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page.replace('const command = "/theme";', "const command = `/theme ${button.dataset.themeName}`;"),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a copied command Claude Code ignores the argument of");
  assert.match(result.stderr, /copies a \/theme command with a theme argument/);
});

test("rejects cards that hide the surface hex the guides promise", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(fixturePage, page.replace("<br>surface&nbsp;${bg}</div>", "</div>"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted cards that never show the surface hex readers are sent to find");
  assert.match(result.stderr, /promise a surface hex in the gallery/);
});

test("rejects a live region hidden inside a closed disclosure", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page.replace(
      '      <div class="grid" id="grid"></div>\n    </details>\n    <p class="sr-only" id="themeCopyStatus" aria-live="polite"></p>\n',
      '      <div class="grid" id="grid"></div>\n      <p class="sr-only" id="themeCopyStatus" aria-live="polite"></p>\n    </details>\n',
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted an announcement no screen reader can hear while the archive is closed");
  assert.match(result.stderr, /puts a live region inside a <details> body/);
});

test("rejects alt text that calls the share card's strip theme accents", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  for (const name of ["index.html", "claude-code-theme-install-guide.html", "semantic-terminal-colors.html"]) {
    const path = join(fixtureRoot, name);
    const page = await readFile(path, "utf8");
    await writeFile(path, page.replaceAll("a strip of the site&#39;s interface colors", "a strip of the pack&#39;s accent colors"));
  }

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted alt text describing colours the image does not show");
  assert.match(result.stderr, /describe the share card's strip as theme accent colours/);
});

test("rejects a storefront Vol. 2 heading that misstates the pack size", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  const heading = /Vol\.&nbsp;2 — ([a-z]+|\d+) new atmospheres/i;
  assert.match(page, heading, "fixture anchor moved; update this test");
  const wrong = vol2Count === 11 ? "ten" : "eleven";
  await writeFile(fixturePage, page.replace(heading, `Vol.&nbsp;2 — ${wrong} new atmospheres`));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a stale Vol. 2 count on the storefront");
  assert.match(result.stderr, new RegExp(`Vol\\. 2 heading says "${wrong}" new atmospheres; the pack ships ${vol2Count}`));
});

test("rejects a page that shows /theme with a theme argument as a command", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page.replace(
      '<div class="monolith-prompt"><span>&gt;</span><span>/theme</span></div>',
      '<div class="monolith-prompt"><span>&gt;</span><span>theme deep-field</span></div>',
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a displayed command that applies nothing");
  assert.match(result.stderr, /shows "theme deep-field" as a command/);
});

test("rejects a finder that promises file-name search without the file names", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(fixturePage, page.replace("${themeSlug}.json ${accent}", "${themeSlug} ${accent}"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a search promise the finder cannot keep");
  assert.match(result.stderr, /says the finder searches by file name/);
});

test("rejects a role=status region hidden inside a closed disclosure", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(fixturePage, page.replace('<div class="grid" id="grid"></div>', '<div class="grid" id="grid"></div><p role="status"></p>'));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a status region no screen reader can hear while the archive is closed");
  assert.match(result.stderr, /puts a live region inside a <details> body[^\n]*role="status"/);
});

test("rejects cards whose template shows `theme ${slug}` again", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(fixturePage, page.replace('<span class="txt">/theme</span>', '<span class="txt">theme ${themeSlug}</span>'));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted all 62 cards showing a command that applies nothing");
  assert.match(result.stderr, /shows "theme absinthe" as a command \(Absinthe\)/);
});

test("rejects a surface hex that only an attribute carries", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page.replace(
      '<div class="hint">then choose &ldquo;${esc(name)}&rdquo;<br>surface&nbsp;${bg}</div>',
      '<div class="hint" title="surface ${bg}">then choose &ldquo;${esc(name)}&rdquo;</div>',
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a surface hex no reader can see on the card");
  assert.match(result.stderr, /promise a surface hex in the gallery/);
});

test("rejects a theme file the finder's file-name search cannot find", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const themes = join(fixtureRoot, "plugins", "dark-themes-vol-2", "themes");
  await rename(join(themes, "neon-noir.json"), join(themes, "neonnoir.json"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a file name the finder derives differently");
  // Since #62 the quick picks load every theme through build-theme-pages.mjs,
  // whose own slug check rejects the rename before the finder check runs.
  assert.match(
    result.stderr,
    /Searching "neonnoir\.json" finds nothing|neonnoir\.json: file name does not match the slug of "Neon Noir"/,
  );
});

test("rejects a live region on a nested summary inside a closed disclosure", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page.replace(
      '<div class="grid" id="grid"></div>',
      "<div class=\"grid\" id=\"grid\"></div><details><summary role='status'>x</summary>y</details>",
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a status region nested inside the closed archive");
  assert.match(result.stderr, /puts a live region inside a <details> body[^\n]*role='status'/);
});

test("rejects cards that show the slug through any template expression", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(fixturePage, page.replace('<span class="txt">/theme</span>', '<span class="txt">theme ${esc(slug(name))}</span>'));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a refactored template that still shows the dead command");
  assert.match(result.stderr, /shows "theme absinthe" as a command/);
});

test("accepts a surface hex styled in its own element", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page.replace("<br>surface&nbsp;${bg}</div>", '<br><span class="mut">surface</span> <span class="hex">${bg}</span></div>'),
  );

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a visible, styled surface hex was rejected:\n${result.stderr}`);
});

test("accepts card copy that names the theme right after the word theme", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page
      .replace("Applied theme &ldquo;${esc(name)}&rdquo;", "Applied theme <b>${esc(name)}</b>")
      .replace("then choose &ldquo;${esc(name)}&rdquo;", "then pick the theme ${esc(name)}"),
  );

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `copy naming the theme to choose was rejected as a command:\n${result.stderr}`);
});

test("rejects the dead command in a meta description", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page.replace('<meta name="description" content="Browse', '<meta name="description" content="Run /theme deep-field. Browse'),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a share description teaching a command that applies nothing");
  assert.match(result.stderr, /shows "theme deep-field" as a command \(the page, in an attribute\)/);
});

test("accepts card renderer refactors that work in a browser", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page
      .replace(
        'const esc = s => s.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));',
        'const esc = s => { const node = document.createElement("div"); node.textContent = s; return node.innerHTML; };',
      )
      .replace(
        "const renderTheme = ([name,accent,shimmer,text,mute,bg]) => {",
        "const renderTheme = ([name,accent,shimmer,text,mute,bg], index) => {",
      )
      .replace(
        '<h3 class="tname">${esc(name)}</h3>',
        '<h3 class="tname">${esc(name)}</h3><span class="n">${index + 1} / ${THEMES.length}</span>${swatch(accent)}',
      )
      .replace("\nconst grid = document", '\nconst swatch = hex => `<i style="background:${hex}"></i>`;\nconst grid = document')
      .replace(/\r?\n/g, "\r\n"),
  );

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a working renderer refactor broke the card checks:\n${result.stderr}`);
});

test("rejects a gallery the page renders without renderTheme", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page.replace(
      'grid.innerHTML = THEMES.map(renderTheme).join("");',
      'grid.innerHTML = THEMES.map(row => renderTheme(row).replace("surface", "")).join("");',
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier checked cards the page does not show");
  assert.match(result.stderr, /#grid in index\.html does not hold THEMES\.map\(renderTheme\)/);
});

test("names the page script's own error when the gallery never renders", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(fixturePage, page.replace("\nconst grid = document", "\nconst motion = reducedMotionQuery.matches;\nconst grid = document"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier passed a page whose script stopped before rendering the gallery");
  assert.match(result.stderr, /The page script failed first: reducedMotionQuery is not defined/);
});

const textNodeEsc =
  'const esc = s => { const div = document.createElement("div"); ' +
  "div.appendChild(document.createTextNode(s)); return div.innerHTML; };";
const pageEsc = 'const esc = s => s.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));';

test("rejects the dead command behind a prompt glyph drawn by CSS", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page
      .replace('<span class="gt">&gt;</span>', "")
      .replace('<span class="txt">/theme</span>', '<span class="txt">theme ${themeSlug}</span>'),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted the dead command once the prompt glyph left the markup");
  assert.match(result.stderr, /shows "theme absinthe" as a command \(Absinthe\)/);
});

test("rejects the dead command behind createTextNode escaping", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page
      .replace(pageEsc, textNodeEsc)
      .replace('<span class="txt">/theme</span>', '<span class="txt">theme ${esc(themeSlug)}</span>'),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted the dead command once esc() went through the DOM");
  assert.match(result.stderr, /shows "theme absinthe" as a command \(Absinthe\)/);
});

test("fails loudly when the stand-in DOM renders a card without its name", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page.replace(
      pageEsc,
      'const esc = s => { const div = document.createElement("div"); div.prepend(s); return div.innerHTML; };',
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier checked blank cards a browser never shows");
  assert.match(result.stderr, /rendered the Absinthe card without its name/);
});

test("accepts page scripts that walk or clear the DOM, reject, or import a module", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  const headScript =
    '<script>const fig = document.querySelector(".theme-monolith"); let top = 0;' +
    " for (let n = fig; n; n = n.offsetParent) top += n.offsetTop || 0;" +
    ' (async () => { const repo = await document.fonts.ready.then(() => fetch("/repo.json")); })();</script>';
  await writeFile(
    fixturePage,
    page
      .replace("</head>", `${headScript}\n</head>`)
      .replace(
        'const grid = document.getElementById("grid");',
        'const grid = document.getElementById("grid");\nwhile (grid.firstChild) grid.removeChild(grid.firstChild);',
      )
      .replace("\nupdateFinder();\n", '\nupdateFinder();\nimport("./assets/js/readout.js").then((m) => m.attach(grid));\n'),
  );

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `ordinary page code broke the card checks:\n${result.stderr}`);
});

test("accepts a gallery filled through querySelector on DOMContentLoaded", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  const fill =
    'grid.innerHTML = THEMES.map(renderTheme).join("");\nconst vol2Grid = document.getElementById("vol2Grid");\n' +
    'vol2Grid.innerHTML = VOL2_THEMES.map(renderTheme).join("");';
  assert.ok(page.includes(fill), "fixture anchor moved; update this test");
  await writeFile(
    fixturePage,
    page
      .replace('const grid = document.getElementById("grid");', 'const grid = document.querySelector("#grid");')
      .replace(
        fill,
        'const vol2Grid = document.querySelector("#vol2Grid");\n' +
          'document.addEventListener("DOMContentLoaded", () => {\n' +
          '  grid.innerHTML = THEMES.map(renderTheme).join("\\n");\n' +
          '  vol2Grid.innerHTML = VOL2_THEMES.map(renderTheme).join("\\n");\n' +
          "});",
      ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a gallery the browser renders identically was rejected:\n${result.stderr}`);
});

test("accepts /theme with the theme to choose on the next line", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  const prompt = '<div class="monolith-prompt"><span>&gt;</span><span>/theme</span></div>';
  await writeFile(
    fixturePage,
    page
      .replace(prompt, `${prompt}<ul class="monolith-picker"><li aria-current="true">Deep Field</li><li>Graphite</li></ul>`)
      .replace(
        "Run <code>/theme</code> and choose one.",
        "Run <code>/theme</code></p><p>Graphite, Ink and Soot sit near the top of the picker.",
      ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `the command followed by a separate line naming a theme was rejected:\n${result.stderr}`);
});

test("accepts createTextNode escaping and favourites read from localStorage", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  const renderer = "const renderTheme = ([name,accent,shimmer,text,mute,bg]) => {";
  await writeFile(
    fixturePage,
    page
      .replace(pageEsc, textNodeEsc)
      .replace(renderer, `const favourites = new Set(JSON.parse(localStorage.getItem("favourites") || "[]"));\n${renderer}`)
      .replace(
        '<h3 class="tname">${esc(name)}</h3>',
        '<h3 class="tname">${esc(name)}</h3>${favourites.has(name) ? \'<span class="fav">★</span>\' : ""}',
      ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a working page was rejected:\n${result.stderr}`);
});

test("rejects the dead command when a source line break splits it", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page.replace(
      '<span class="txt">/theme</span>',
      '<span class="txt">/theme</span>\n        <span class="arg">${themeSlug}</span>',
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a newline in the HTML source hid the dead command, though a browser shows one line");
  assert.match(result.stderr, /shows "theme absinthe" as a command \(Absinthe\)/);
});

test("keeps running the page's scripts after one of them throws", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  const analytics =
    '<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>' +
    "<script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);}" +
    ' gtag("js", new Date()); gtag("config", "G-ABC123");</script>' +
    '<script>FeedbackWidget.init({ site: "gabs-utilities" });</script>';
  await writeFile(fixturePage, page.replace("</head>", `${analytics}\n</head>`));

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `one throwing head script stopped the gallery script from running:\n${result.stderr}`);
});

test("accepts prose naming the theme inside a button or a prompt-styled line", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page
      .replace(
        '<h3 class="tname">${esc(name)}</h3>',
        '<h3 class="tname">${esc(name)}</h3><button class="fav" type="button" aria-pressed="false">' +
          '<span aria-hidden="true">☆</span><span class="sr-only">Save theme ${esc(name)}</span></button>',
      )
      .replace(
        "Run <code>/theme</code> and choose one.",
        'Run <code>/theme</code> and choose one.</p><p class="vol2-prompt">Not sure where to start? ' +
          "Try the theme Graphite, then Ink.</p><p>",
      ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a label naming the theme was read as a command:\n${result.stderr}`);
});

test("names the page script's error when a card loses its name", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page
      .replace(pageEsc, 'const esc = s => { const div = document.createElement("div"); div.prepend(s); return div.innerHTML; };')
      .replace("\nupdateFinder();\n", "\nupdateFinder();\nconst motion = reducedMotionQuery.matches;\n"),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier checked blank cards a browser never shows");
  assert.match(result.stderr, /rendered the Absinthe card without its name[^\n]*failed first: reducedMotionQuery is not defined/);
});

test("accepts a <pre> transcript with the theme to choose on the next line", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(
    fixturePage,
    page.replace(
      "Run <code>/theme</code> and choose one.",
      "Run <code>/theme</code> and choose one.</p><pre><code>&gt; /theme\nDeep Field  ← pick it in the list</code></pre><p>",
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a <pre> line break, which a browser keeps, was read as one line:\n${result.stderr}`);
});

test("rejects a plugin install command with no word about restarting Claude Code", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const readme = join(fixtureRoot, "plugins", "dark-themes-vol-2", "README.md");
  const text = await readFile(readme, "utf8");
  const note = "Then restart Claude Code: plugin themes load when it starts, so the session you installed from\nwon't list them. ";
  assert.ok(text.includes(note), "fixture anchor moved; update this test");
  await writeFile(readme, text.replace(note, ""));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted install steps that leave a running session without the themes");
  assert.match(result.stderr, /plugins\/dark-themes-vol-2\/README\.md gives "plugin install dark-themes-vol-2@notgabriels-themes" without saying to restart/);
});

test("rejects a page that calls the repository MIT while products carry other licences", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const article = join(fixtureRoot, "semantic-terminal-colors.html");
  const text = await readFile(article, "utf8");
  const answer = "Yes. The 50-theme set, the Vol. 2 expansion, both plugin packages and the installer are public under the MIT license.";
  assert.ok(text.includes(answer), "fixture anchor moved; update this test");
  await writeFile(article, text.replace(answer, "Yes. The complete theme set and source repository are free under the MIT license."));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted an MIT claim for a repository holding restrictively licensed products");
  assert.match(result.stderr, /semantic-terminal-colors\.html says the repository is MIT/);
});

test("rejects a page that still offers the withdrawn free Gumroad download", { timeout: 90_000 }, async (t) => {
  // The install guide's FAQ has its own guard (from #61); this one covers every
  // other public page, so plant the offer where only it looks.
  const fixtureRoot = await makeFixture(t);
  const readmePath = join(fixtureRoot, "README.md");
  const text = await readFile(readmePath, "utf8");
  const anchor = "The plugin route above is the recommended install.";
  assert.ok(text.includes(anchor), "fixture anchor moved; update this test");
  await writeFile(
    readmePath,
    text.replace(anchor, `The Gumroad ZIP can be downloaded for zero by choosing the free price. ${anchor}`),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted the withdrawn Gumroad route");
  assert.match(result.stderr, /README\.md still offers the withdrawn free Gumroad download/);
});

test("rejects a Vol. 2 previews.json entry that no packaged theme uses", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const previewsPath = join(fixtureRoot, "plugins", "dark-themes-vol-2", "previews.json");
  const previews = JSON.parse(await readFile(previewsPath, "utf8"));
  await writeFile(previewsPath, `${JSON.stringify({ ...previews, Ghost: "#000000" }, null, 2)}\n`);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a stale preview entry for a theme that does not exist");
  assert.match(result.stderr, /previews\.json has an entry for Ghost, which no packaged theme uses/);
});

test("rejects a plugin install command given without the marketplace it needs", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const llms = join(fixtureRoot, "llms.txt");
  const text = await readFile(llms, "utf8");
  const marketplace = "claude plugin marketplace add notgabriels-sys/claude-code-50-dark-themes\n";
  assert.ok(text.includes(marketplace), "fixture anchor moved; update this test");
  await writeFile(llms, text.replace(marketplace, ""));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted an install line that fails on a fresh machine");
  assert.match(result.stderr, /llms\.txt gives a plugin install command but not the marketplace add command/);
});

test("rejects docs that say CI runs on every push when it runs only on main", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const readme = join(fixtureRoot, "README.md");
  const text = await readFile(readme, "utf8");
  const sentence = "payment links on\nevery pull request and every push to `main`.";
  assert.ok(text.includes(sentence), "fixture anchor moved; update this test");
  await writeFile(readme, text.replace(sentence, "payment links on every push."));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a CI claim the workflow's push filter contradicts");
  assert.match(result.stderr, /README\.md says CI runs on "every push"/);
});

// `permission` and `planMode` are held to the 3:1 non-text floor, but Claude
// Code draws text in them. README states how many themes keep that text below
// AA and the lowest ratio; both must match what verify-contrast.mjs computes.
// The anchors come from today's values and tolerate any rewrap of README.
const lowestIndicator = indicatorTextBelowAA[0];
const spaced = (text) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"));
// Anchored on "keep": README has other "<n> of the <total> themes" sentences
// (the terminal schemes' "Every one of the 62 themes"), and only this one is the claim.
const indicatorCount = new RegExp(`\\b([a-z]+|\\d+)(\\s+)of(\\s+)the(\\s+)${themeTotal}(\\s+)themes(\\s+)keep\\b`, "i");
const lowestClaim = spaced(`${lowestIndicator.ratio.toFixed(2)}:1 in ${lowestIndicator.name}`);

async function editReadmeClaim(fixtureRoot, pattern, replacement) {
  const readme = join(fixtureRoot, "README.md");
  const text = await readFile(readme, "utf8");
  assert.match(text, pattern, "fixture anchor moved; update this test");
  await writeFile(readme, text.replace(pattern, replacement));
}

// Gives each named theme new permission and planMode colours, in every file
// that carries it: a root theme and its plugin copy, or a Vol. 2 theme.
async function setIndicatorColours(fixtureRoot, colours) {
  for (const [name, colour] of Object.entries(colours)) {
    const file = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    const vol2 = `plugins/dark-themes-vol-2/themes/${file}`;
    const paths = (await readdir(fixtureRoot)).includes(file) ? [file, `plugins/50-dark-themes/themes/${file}`] : [vol2];
    for (const path of paths) {
      const target = join(fixtureRoot, path);
      const theme = JSON.parse(await readFile(target, "utf8"));
      assert.equal(theme.name, name, `${path} is not ${name}; update this test`);
      theme.overrides.permission = colour;
      theme.overrides.planMode = colour;
      await writeFile(target, `${JSON.stringify(theme, null, 2)}\n`);
    }
  }
}

// Each theme's own `claude` accent, which the verifier holds at AA.
async function accentsFor(fixtureRoot, names) {
  const colours = {};
  for (const name of names) {
    const file = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    const path = (await readdir(fixtureRoot)).includes(file) ? file : `plugins/dark-themes-vol-2/themes/${file}`;
    colours[name] = JSON.parse(await readFile(join(fixtureRoot, path), "utf8")).overrides.claude;
  }
  return colours;
}

test("rejects a README count of below-AA permission and planMode text that the palettes contradict", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const wrong = indicatorTextBelowAA.length + 1;
  await editReadmeClaim(fixtureRoot, indicatorCount, `${wrong}$2of$3the$4${themeTotal}$5themes$6keep`);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a wrong count of themes below AA");
  assert.match(
    result.stderr,
    new RegExp(`README\\.md must say that ${indicatorTextBelowAA.length} of the ${themeTotal} themes keep \`permission\`/\`planMode\` text below AA; it says "${wrong} of the ${themeTotal} themes"`),
  );
});

test("rejects a README lowest permission and planMode ratio that the palettes contradict", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editReadmeClaim(fixtureRoot, lowestClaim, `${(lowestIndicator.ratio + 0.12).toFixed(2)}:1 in ${lowestIndicator.name}`);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a wrong lowest ratio");
  assert.ok(result.stderr.includes(`must give the lowest \`permission\`/\`planMode\` ratio: ${lowestIndicator.ratio.toFixed(2)}:1 in ${lowestIndicator.name}`), result.stderr);
});

test("rejects a README that names the wrong theme for the lowest permission and planMode ratio", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const other = lowestIndicator.name === "Graphite" ? "Ink" : "Graphite";
  await editReadmeClaim(fixtureRoot, lowestClaim, `${lowestIndicator.ratio.toFixed(2)}:1 in ${other}`);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted the wrong theme for the lowest ratio");
  assert.ok(result.stderr.includes(`must give the lowest \`permission\`/\`planMode\` ratio: ${lowestIndicator.ratio.toFixed(2)}:1 in ${lowestIndicator.name}`), result.stderr);
});

test("holds the README sentence to the palettes when a theme's permission colour changes", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  // The lowest theme takes its own accent; README still states the old count.
  await setIndicatorColours(fixtureRoot, await accentsFor(fixtureRoot, [lowestIndicator.name]));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier kept a below-AA count the palettes no longer support");
  const expected = indicatorTextBelowAA.length - 1
    ? `README.md must say that ${indicatorTextBelowAA.length - 1} of the ${themeTotal} themes keep`
    : "README.md says some `permission`/`planMode` text is below AA";
  assert.ok(result.stderr.includes(expected), result.stderr);
});

test("rejects a README floor paragraph that no longer names permission and planMode", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editReadmeClaim(fixtureRoot, /\s`permission`\s+and\s+`planMode`\s+are\s+held[\s\S]*?(?=\s`subtle`\s+is\s+not\s+checked)/, "");

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a floor paragraph silent about permission and planMode");
  assert.match(result.stderr, /contrast-floor paragraph must say that `permission` and `planMode` are held to the non-text floor/);
});

test("accepts another README paragraph that names permission, planMode and the non-text floor", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editReadmeClaim(
    fixtureRoot,
    /- `permission`, `planMode`: second accent where the theme has one/,
    "- `permission`, `planMode`: second accent where the theme has one, held to the non-text floor",
  );

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a correct README was rejected:\n${result.stderr}`);
});

test("rejects a stale below-AA sentence once every theme holds permission and planMode at AA", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await setIndicatorColours(fixtureRoot, await accentsFor(fixtureRoot, indicatorTextBelowAA.map((row) => row.name)));
  await editReadmeClaim(fixtureRoot, /below(\s+)AA,(\s+)down/, "below$14.5:1,$2down");

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier kept a below-AA sentence no theme supports");
  assert.match(result.stderr, /README\.md says some `permission`\/`planMode` text is below AA, but every theme now holds it at 4\.5:1/);
});

// The terminal app owns its background. Telling the reader to set it is fine;
// saying a theme, plugin or skill sets it is not.
test("rejects a storefront card that says a skill sets the terminal background", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const page = join(fixtureRoot, "index.html");
  const html = await readFile(page, "utf8");
  const card = "gives you the terminal background to set";
  assert.ok(html.includes(card), "fixture anchor moved; update this test");
  await writeFile(page, html.replace(card, "sets your terminal background"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a card promising what only the terminal app can do");
  assert.match(result.stderr, /index\.html claims a tool "sets your terminal background"/);
});

test("rejects a README that says the plugin changes the terminal background", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const readme = join(fixtureRoot, "README.md");
  const text = await readFile(readme, "utf8");
  const anchor = "The plugin keeps the pack together";
  assert.ok(text.includes(anchor), "fixture anchor moved; update this test");
  await writeFile(readme, text.replace(anchor, "The plugin changes the terminal background and keeps the pack together"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a README promising what only the terminal app can do");
  assert.match(result.stderr, /README\.md claims a tool "changes the terminal background"/);
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

const guideZipAnchor = (version) =>
  new RegExp(
    `<a href="https://github\\.com/notgabriels-sys/claude-code-50-dark-themes/releases/download/themes-plugin-v${version.replaceAll(".", "\\.")}/claude-code-dark-themes-v${version.replaceAll(".", "\\.")}\\.zip">[^<]+</a> from the v${version.replaceAll(".", "\\.")} release`,
    "g",
  );

test("rejects an install guide whose FAQ answer sends the free zip to Gumroad", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureGuide = join(fixtureRoot, "claude-code-theme-install-guide.html");
  const guide = await readFile(fixtureGuide, "utf8");
  const answer = /("name": "Do the 50 Claude Code themes cost anything\?",\s*"acceptedAnswer": \{\s*"@type": "Answer",\s*"text": ")[^"]*(")/;
  assert.match(guide, answer, "the guide should carry the cost question in its FAQ schema");
  await writeFile(
    fixtureGuide,
    guide.replace(
      answer,
      "$1No. The 50 dark Claude Code themes are free and MIT licensed. The Gumroad ZIP can be downloaded for zero by choosing the free price.$2",
    ),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a FAQ answer that sends the free zip to Gumroad");
  assert.match(result.stderr, /The install guide still sends readers to a Gumroad zip at the free price/);
});

test("rejects an install guide whose FAQ answer names a zip of an unshipped version", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureGuide = join(fixtureRoot, "claude-code-theme-install-guide.html");
  const guide = await readFile(fixtureGuide, "utf8");
  const version = await readManifestVersion(fixtureRoot, "50-dark-themes");
  const current = `themes-plugin-v${version}/claude-code-dark-themes-v${version}.zip`;
  const schemaEnd = guide.indexOf("</head>");
  assert.ok(guide.slice(0, schemaEnd).includes(current), "the FAQ schema in <head> should name the current zip");
  // Only the first occurrence sits in the FAQ schema; the visible links further down keep the current version.
  await writeFile(fixtureGuide, guide.replace(current, "themes-plugin-v0.9.0/claude-code-dark-themes-v0.9.0.zip"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a FAQ answer pointing at a zip no shipped version claims");
  assert.match(result.stderr, /The install guide links a release that no shipped pack version claims: .*v0\.9\.0/);
});

test("rejects an install guide that drops the visible zip link its FAQ schema promises", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureGuide = join(fixtureRoot, "claude-code-theme-install-guide.html");
  const guide = await readFile(fixtureGuide, "utf8");
  const version = await readManifestVersion(fixtureRoot, "50-dark-themes");
  assert.match(guide, guideZipAnchor(version), "the guide should link the current zip with its release version beside it");
  await writeFile(fixtureGuide, guide.replace(guideZipAnchor(version), "ask for the zip"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted an install guide whose FAQ promises a zip link the page does not show");
  assert.match(result.stderr, /The install guide must link the 50 Dark Themes zip at /);
});

test("rejects an install guide whose visible zip caption names a version the link does not resolve to", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureGuide = join(fixtureRoot, "claude-code-theme-install-guide.html");
  const guide = await readFile(fixtureGuide, "utf8");
  const version = await readManifestVersion(fixtureRoot, "50-dark-themes");
  assert.match(guide, guideZipAnchor(version));
  await writeFile(
    fixtureGuide,
    guide.replace(guideZipAnchor(version), (anchor) => anchor.replace(`from the v${version} release`, "from the v9.9.9 release")),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a zip link captioned with a version it does not resolve to");
  assert.match(result.stderr, new RegExp(`say "from the v${version.replaceAll(".", "\\.")} release" beside it`));
});

test("rejects an install guide whose FAQ schema does not parse", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureGuide = join(fixtureRoot, "claude-code-theme-install-guide.html");
  const guide = await readFile(fixtureGuide, "utf8");
  assert.ok(guide.includes('"@type": "FAQPage",'), "the guide should carry a FAQPage schema");
  await writeFile(fixtureGuide, guide.replace('"@type": "FAQPage",', '"@type": "FAQPage",,'));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted an install guide with broken JSON-LD");
  assert.match(result.stderr, /carries JSON-LD that does not parse/);
});

test("rejects an install guide whose FAQ schema loses the cost question", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureGuide = join(fixtureRoot, "claude-code-theme-install-guide.html");
  const guide = await readFile(fixtureGuide, "utf8");
  const question = '"name": "Do the 50 Claude Code themes cost anything?",';
  assert.ok(guide.includes(question));
  await writeFile(fixtureGuide, guide.replace(question, '"name": "Are the themes paid?",'));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a FAQ schema without the cost question");
  assert.match(result.stderr, /FAQ schema must keep the question "Do the 50 Claude Code themes cost anything\?"/);
});

test("rejects an install guide that has no FAQPage schema at all", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureGuide = join(fixtureRoot, "claude-code-theme-install-guide.html");
  const guide = await readFile(fixtureGuide, "utf8");
  const faqBlock = guide.match(/<script type="application\/ld\+json">\s*\{[^]*?"@type": "FAQPage"[^]*?<\/script>\n/);
  assert.ok(faqBlock, "the guide should carry a FAQPage schema block");
  await writeFile(fixtureGuide, guide.replace(faqBlock[0], ""));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted an install guide without any FAQPage schema");
  assert.match(result.stderr, /carries no FAQPage JSON-LD block/);
});

test("accepts an install guide whose FAQ schema carries extra script attributes and a single question object", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureGuide = join(fixtureRoot, "claude-code-theme-install-guide.html");
  const guide = await readFile(fixtureGuide, "utf8");
  // The guide carries several JSON-LD blocks (HowTo, FAQPage); pick the FAQPage one by parsing each.
  const faqBlock = [...guide.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .find((match) => JSON.parse(match[1])["@type"] === "FAQPage");
  assert.ok(faqBlock, "the guide should carry a FAQPage schema block");
  const schema = JSON.parse(faqBlock[1]);
  const costQuestion = schema.mainEntity.find((entry) => entry.name === "Do the 50 Claude Code themes cost anything?");
  schema.mainEntity = costQuestion;
  await writeFile(
    fixtureGuide,
    guide.replace(faqBlock[0], `<script id="faq-schema" type='application/ld+json'>\n${JSON.stringify(schema, null, 2)}\n</script>`),
  );

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, result.stderr);
});

test("rejects an install guide whose FAQ answer names neither Gumroad nor the free zip", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const fixtureGuide = join(fixtureRoot, "claude-code-theme-install-guide.html");
  const guide = await readFile(fixtureGuide, "utf8");
  const answer = /("name": "Do the 50 Claude Code themes cost anything\?",\s*"acceptedAnswer": \{\s*"@type": "Answer",\s*"text": ")[^"]*(")/;
  assert.match(guide, answer, "the guide should carry the cost question in its FAQ schema");
  await writeFile(fixtureGuide, guide.replace(answer, "$1No. The 50 dark Claude Code themes are free and MIT licensed.$2"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a FAQ answer that never says where the free zip is");
  assert.match(result.stderr, /The install guide's FAQ answer must name the free zip at /);
});

test("rejects a repository that lets a checkout turn the generated pages CRLF", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await rm(join(fixtureRoot, ".gitattributes"), { force: true });

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a checkout config under which every generated page reads as stale");
  assert.match(result.stderr, /\.gitattributes must keep text files LF in every checkout/);
});

test("rejects a .gitattributes whose last catch-all rule drops eol=lf", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await writeFile(join(fixtureRoot, ".gitattributes"), "* text=auto eol=lf\n*.png binary\n* text=auto\n");

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a later catch-all rule that lets checkouts use CRLF again");
  assert.match(result.stderr, /\.gitattributes must keep text files LF in every checkout/);
});

test("accepts a storefront an editor saved with CRLF line endings", { timeout: 90_000 }, async (t) => {
  // index.html is edited by hand; Git stores it LF whatever the editor wrote,
  // so the quick-picks check compares lines, not line endings.
  const fixtureRoot = await makeFixture(t);
  const fixturePage = join(fixtureRoot, "index.html");
  const page = await readFile(fixturePage, "utf8");
  await writeFile(fixturePage, page.replace(/\r?\n/g, "\r\n"));

  const result = await runVerifier(fixtureRoot);

  assert.equal(result.code, 0, `a CRLF save of a correct storefront failed:\n${result.stderr}`);
});
