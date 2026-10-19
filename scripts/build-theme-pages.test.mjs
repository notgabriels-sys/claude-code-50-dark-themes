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
  return runScript(cwd, "scripts/verify.mjs");
}

async function runScript(cwd, script) {
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

test("a changed copy script on the theme pages still needs a review", { timeout: 120_000 }, async (t) => {
  // The builder writes each page's Content-Security-Policy from its own copy
  // script, so a page and its policy always agree. What makes a changed script
  // a deliberate edit is verify's reviewedThemePageScripts, which the builder
  // does not write.
  const fixtureRoot = await makeFixture(t);
  const builder = join(fixtureRoot, "scripts/build-theme-pages.mjs");
  const source = await readFile(builder, "utf8");
  const anchor = '      button.textContent = "Copied";\n';
  assert.equal(source.split(anchor).length, 2, "the copy script's anchor appears once");
  await writeFile(builder, source.replace(anchor, `${anchor}      location.assign("https://pay.example.invalid/");\n`));
  const rebuilt = await runScript(fixtureRoot, "scripts/build-theme-pages.mjs");
  assert.equal(rebuilt.code, 0, rebuilt.stderr);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "a changed copy script shipped on the theme pages unreviewed");
  assert.match(result.stderr, /theme\/(?:[a-z0-9-]+\/)?index\.html runs an inline script nobody has reviewed/);
});
