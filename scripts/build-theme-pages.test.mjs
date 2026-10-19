import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildThemePages } from "./build-theme-pages.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

async function makeFixture(t) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gabs-theme-pages-verify-"));
  const fixtureRoot = join(temporaryRoot, "repo");
  await cp(projectRoot, fixtureRoot, {
    recursive: true,
    filter(source) {
      const pathFromRoot = relative(projectRoot, source);
      const isExcludedDirectory = [".git", ".worktrees", "node_modules"].some(
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

test("renders one page per theme, an index and the sitemap, deterministically", async () => {
  const root = new URL("../", import.meta.url);
  const first = await buildThemePages(root);
  const second = await buildThemePages(root);
  assert.equal(first.size, second.size);
  for (const [path, content] of first) assert.equal(second.get(path), content, `${path} rendered differently twice`);
  assert.ok(first.has("theme/index.html"));
  assert.ok(first.has("sitemap.xml"));
  assert.ok(first.has("theme/graphite/index.html"));
  assert.ok(first.has("theme/afterglow/index.html"), "Vol. 2 themes get pages too");
  const sitemap = first.get("sitemap.xml");
  for (const path of first.keys()) {
    if (!path.startsWith("theme/")) continue;
    const url = `https://gabs-utilities.com/${path.replace(/index\.html$/, "")}`;
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), `sitemap lists ${url}`);
  }
});

test("rejects a theme page whose stated palette drifted from its theme file", { timeout: 120_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const page = join(fixtureRoot, "theme/graphite/index.html");
  const html = await readFile(page, "utf8");
  const graphite = JSON.parse(await readFile(join(fixtureRoot, "graphite.json"), "utf8"));
  assert.ok(html.includes(graphite.overrides.claude));
  await writeFile(page, html.replaceAll(graphite.overrides.claude, "#FF00FF"));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a theme page stating colours its theme does not have");
  assert.match(result.stderr, /theme\/graphite\/index\.html is stale/);
});

test("rejects a theme with no page", { timeout: 120_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await rm(join(fixtureRoot, "theme/afterglow"), { recursive: true, force: true });

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a packaged theme with no page");
  assert.match(result.stderr, /theme\/afterglow\/index\.html is missing/);
});

test("rejects a page with no theme behind it", { timeout: 120_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const stray = join(fixtureRoot, "theme/midnight-oil");
  await mkdir(stray, { recursive: true });
  await writeFile(join(stray, "index.html"), "<!doctype html><title>Midnight Oil</title>");

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a theme page for a theme that does not exist");
  assert.match(result.stderr, /theme\/midnight-oil\/index\.html has no theme behind it/);
});

test("rejects a sitemap that drops a theme page", { timeout: 120_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const sitemapPath = join(fixtureRoot, "sitemap.xml");
  const sitemap = await readFile(sitemapPath, "utf8");
  const line = sitemap.split("\n").find((entry) => entry.includes("/theme/graphite/"));
  assert.ok(line, "the sitemap lists the Graphite page");
  await writeFile(sitemapPath, sitemap.replace(`${line}\n`, ""));

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a sitemap missing a theme page");
  assert.match(result.stderr, /sitemap\.xml is stale/);
});

// Renders the fixture's pages with its own (edited) builder, as a contributor
// would after changing the template.
async function rebuildPages(fixtureRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/build-theme-pages.mjs"], { cwd: fixtureRoot });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`builder exited ${code}`))));
  });
}

async function editBuilder(fixtureRoot, from, to) {
  const builder = join(fixtureRoot, "scripts/build-theme-pages.mjs");
  const source = await readFile(builder, "utf8");
  assert.ok(source.includes(from), "fixture anchor moved; update this test");
  await writeFile(builder, source.replace(from, to));
  await rebuildPages(fixtureRoot);
}

// Claude Code's /theme takes no argument: `/theme acid` opens the same picker
// as `/theme` and applies nothing (2.1.302 and 2.1.303, run live).
test("rejects theme pages that offer /theme with the theme as an argument", { timeout: 120_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editBuilder(fixtureRoot, 'commandPanel("/theme", ', "commandPanel(`/theme ${slug}`, ");

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted 62 pages handing out a command that does nothing");
  assert.match(result.stderr, /theme\/absinthe\/index\.html shows "theme absinthe" as a command/);
});

test("rejects a theme page specimen that types the theme name after /theme", { timeout: 120_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editBuilder(fixtureRoot, '<span class="txt">/theme</span>', '<span class="txt">theme ${esc(slug)}</span>');

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a specimen acting out the dead command");
  assert.match(result.stderr, /theme\/absinthe\/index\.html shows "theme absinthe" as a command/);
});

// Plugin themes load when Claude Code starts: a session open during the
// install lists none of them until a restart (2.1.302 and 2.1.303, run live).
const restartNote = "If Claude Code was open while you installed, restart it: plugin themes load when it starts.";

test("rejects theme pages that give the plugin install with no restart note", { timeout: 120_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editBuilder(fixtureRoot, `      <p class="note">${restartNote}</p>\n`, "");

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted an install section with no restart note");
  assert.match(result.stderr, /theme\/absinthe\/index\.html gives "plugin install 50-dark-themes@notgabriels-themes" without saying to restart/);
});

test("rejects a theme index that gives the plugin install with no restart note", { timeout: 120_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editBuilder(fixtureRoot, `</code>. ${restartNote} Previewed`, "</code>. Previewed");

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted an index with no restart note");
  assert.match(result.stderr, /theme\/index\.html gives "plugin install [\w-]+@notgabriels-themes" without saying to restart/);
});
