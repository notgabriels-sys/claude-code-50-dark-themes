import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  assert.match(result.stderr, /aria-live region inside a <details> body/);
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
  await writeFile(fixturePage, page.replace("Vol.&nbsp;2 — twelve new atmospheres", "Vol.&nbsp;2 — eleven new atmospheres"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a stale Vol. 2 count on the storefront");
  assert.match(result.stderr, /Vol\. 2 heading says "eleven" new atmospheres; the pack ships 12/);
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
