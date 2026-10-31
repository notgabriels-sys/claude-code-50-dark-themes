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

// What the sitemap lists is read against the pages, not against the builder that writes it: each
// row breaks the builder or a page in a fixture, rebuilds, and expects verify's own message.
const builderPath = "scripts/build-theme-pages.mjs";
const familiarsRow = '  ["familiars.html", "monthly", "0.76"],\n';
const sitemapEntryLine = "  `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : \"\"}";
const impressumRobots = '<meta name="robots" content="noindex">';
const listImpressum = [builderPath, familiarsRow, `${familiarsRow}  ["impressum.html", "yearly", "0.3"],\n`];
for (const [defect, edits, message] of [
  ["lists a page that asks not to be indexed", [listImpressum],
    /sitemap\.xml lists https:\/\/gabs-utilities\.com\/impressum\.html, but impressum\.html carries a robots noindex/],
  ["lists a page whose noindex is written in capitals beside another directive",
    [listImpressum, ["impressum.html", impressumRobots, '<meta name="robots" content="NoIndex, NoFollow">']],
    /impressum\.html carries a robots noindex/],
  ["lists a page a googlebot meta keeps out with none",
    [["familiars.html", '<meta name="viewport"', '<meta name="googlebot" content="none">\n<meta name="viewport"']],
    /sitemap\.xml lists https:\/\/gabs-utilities\.com\/familiars\.html, but familiars\.html carries a robots noindex/],
  ["hides a page's noindex behind a character reference",
    [listImpressum, ["impressum.html", impressumRobots, '<meta name="robots" content="&#110;oindex">']],
    /impressum\.html writes a robots meta with "&" in its content/],
  ["leaves out a page whose noindex sits in its body, where a crawler does not read it",
    [["impressum.html", `  ${impressumRobots}\n`, ""], ["impressum.html", "<body>\n", `<body>\n${impressumRobots}\n`]],
    /impressum\.html's robots meta must sit in the head, with only head tags, comments and whitespace before it; <\/head> comes before it here/],
  ["leaves out a page whose noindex follows a tag that ends the head",
    [["impressum.html", `  ${impressumRobots}\n`, `  <br>\n  ${impressumRobots}\n`]],
    /impressum\.html's robots meta must sit in the head, with only head tags, comments and whitespace before it; <br> comes before it here/],
  ["leaves out a page whose noindex follows text in the head",
    [["impressum.html", `  ${impressumRobots}\n`, `  Legal notice\n  ${impressumRobots}\n`]],
    /impressum\.html's robots meta must sit in the head, with only head tags, comments and whitespace before it; text comes before it here/],
  ["leaves out a page whose noindex follows a comment in the head",
    [["impressum.html", `  ${impressumRobots}\n`, `  <!-- legal notice: not for search -->\n  ${impressumRobots}\n`]], null],
  ["reads a meta name written with a character reference", [["impressum.html", impressumRobots, '<meta name="r&#111;bots" content="noindex">']],
    /impressum\.html writes a meta name as "r&#111;bots"; write it plainly/],
  ["reads a meta name with a space after it", [["impressum.html", impressumRobots, '<meta name="robots " content="noindex">']],
    /impressum\.html writes a meta name as "robots "; write it plainly/],
  ["reads a noindex for one other crawler",
    [["familiars.html", '<meta name="twitter:card" content="summary_large_image">', '<meta name="bingbot" content="noindex">\n<meta name="twitter:card" content="summary_large_image">']],
    /familiars\.html has a meta for one crawler, "bingbot"/],
  ["reads directives separated by a semicolon", [["impressum.html", impressumRobots, '<meta name="robots" content="noindex;nofollow">']],
    /impressum\.html's robots meta reads "noindex;nofollow", which is not a directive verify knows/],
  ["reads a directive verify does not model", [["impressum.html", impressumRobots, '<meta name="robots" content="noindex, unavailable_after: 2026-01-01">']],
    /impressum\.html's robots meta reads "unavailable_after: 2026-01-01", which is not a directive verify knows/],
  ["lists a page whose canonical names another address",
    [["semantic-terminal-colors.html", '<link rel="canonical" href="https://gabs-utilities.com/semantic-terminal-colors.html">', '<link rel="canonical" href="https://gabs-utilities.com/">']],
    /sitemap\.xml lists https:\/\/gabs-utilities\.com\/semantic-terminal-colors\.html, but semantic-terminal-colors\.html names https:\/\/gabs-utilities\.com\/ as its canonical address/],
  ["lists a dated page that asks not to be indexed",
    [["semantic-terminal-colors.html", '<meta name="robots" content="index,follow,max-image-preview:large">', '<meta name="robots" content="noindex">']],
    /semantic-terminal-colors\.html carries a robots noindex\. A dated page stays in the sitemap with its <lastmod>, so it cannot carry one/],
  ["lists a page the site does not serve", [[builderPath, familiarsRow, `${familiarsRow}  ["missing.html", "monthly", "0.5"],\n`]],
    /sitemap\.xml lists https:\/\/gabs-utilities\.com\/missing\.html, which is not the address of a page this site serves/],
  ["lists a page twice", [[builderPath, familiarsRow, `${familiarsRow}${familiarsRow}`]],
    /sitemap\.xml lists https:\/\/gabs-utilities\.com\/familiars\.html twice/],
  ["leaves out a page a search engine may index", [[builderPath, familiarsRow, ""]],
    /familiars\.html is a page a search engine may index, and sitemap\.xml does not list it\. Add it to FIXED_SITEMAP_PAGES/],
  ["leaves out a theme page", [[builderPath, "...themes.map((theme) =>", "...themes.slice(1).map((theme) =>"]],
    /theme\/[a-z0-9-]+\/index\.html is a page a search engine may index, and sitemap\.xml does not list it; scripts\/build-theme-pages\.mjs lists every page it renders/],
  ["dates a page by the day it was published", [[builderPath, "modified.set(page, dates.modified);", "modified.set(page, dates.published);"]],
    /sitemap\.xml gives claude-code-theme-install-guide\.html <lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>; a dated page's <lastmod> is its JSON-LD dateModified/],
  ["gives a dated page no lastmod", [[builderPath, "lastModified.get(page))", "undefined)"]],
    /sitemap\.xml gives claude-code-theme-install-guide\.html no <lastmod>/],
  ["gives a page without dates a lastmod",
    [[builderPath, "lastModified.get(page))", 'lastModified.get(page) ?? (page === "index.html" ? "2026-10-01" : undefined))']],
    /sitemap\.xml gives index\.html a <lastmod>, but only a dated page in scripts\/page-dates\.mjs states the day it last changed/],
  ["writes a lastmod verify cannot read", [[builderPath, "<lastmod>${lastmod}</lastmod>", "<lastmod>${lastmod}T00:00:00Z</lastmod>"]],
    /sitemap\.xml has a <lastmod> verify cannot read/],
  ["writes two locations in one entry", [[builderPath, sitemapEntryLine, sitemapEntryLine.replace("<loc>${loc}</loc>", "<loc>${loc}</loc><loc>${loc}</loc>")]],
    /sitemap\.xml has a <url> with 2 <loc> elements/],
  ["writes an entry verify cannot read", [[builderPath, sitemapEntryLine, sitemapEntryLine.replace("<url><loc>", "<url ><loc>")]],
    /sitemap\.xml has a <url> verify cannot read/],
]) {
  test(`rejects a sitemap that ${defect}`, { timeout: 120_000 }, async (t) => {
    const fixtureRoot = await makeFixture(t);
    for (const [path, from, to] of edits) {
      const file = join(fixtureRoot, path);
      const text = await readFile(file, "utf8");
      assert.equal(text.split(from).length, 2, `fixture anchor must occur exactly once in ${path}: ${from}`);
      await writeFile(file, text.replace(from, () => to));
    }
    const rebuilt = await runScript(fixtureRoot, builderPath);
    assert.equal(rebuilt.code, 0, rebuilt.stderr);

    const result = await runVerifier(fixtureRoot);

    if (message === null) {
      assert.equal(result.code, 0, `a sitemap that ${defect} was refused: ${result.stderr}`);
      return;
    }
    assert.notEqual(result.code, 0, `the verifier accepted a sitemap that ${defect}`);
    assert.match(result.stderr, message);
  });
}

test("a dated page's moved dateModified leaves the sitemap stale until it is rebuilt", { timeout: 120_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const page = join(fixtureRoot, "claude-code-theme-install-guide.html");
  const markup = await readFile(page, "utf8");
  const { modified } = (await import("./page-dates.mjs")).statedDates(markup);
  // A day earlier, so the moved date can never fall after today.
  const earlier = new Date(Date.parse(`${modified}T00:00:00Z`) - 86400e3).toISOString().slice(0, 10);
  const words = (day) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  let moved = markup;
  for (const [from, to] of [
    [`"dateModified": "${modified}"`, `"dateModified": "${earlier}"`],
    [`updated <time datetime="${modified}">${words(modified)}</time>`, `updated <time datetime="${earlier}">${words(earlier)}</time>`],
  ]) {
    assert.equal(moved.split(from).length, 2, `fixture anchor must occur exactly once: ${from}`);
    moved = moved.replace(from, () => to);
  }
  await writeFile(page, moved);

  const stale = await runVerifier(fixtureRoot);
  assert.notEqual(stale.code, 0, "the verifier accepted a sitemap whose lastmod no longer matches the page");
  assert.match(stale.stderr, /sitemap\.xml is stale: it does not match what scripts\/build-theme-pages\.mjs renders from the theme files and the dated pages' dateModified/);

  const rebuilt = await runScript(fixtureRoot, builderPath);
  assert.equal(rebuilt.code, 0, rebuilt.stderr);
  const fresh = await runVerifier(fixtureRoot);
  assert.equal(fresh.code, 0, fresh.stderr);
});

for (const [defect, path, from, to, message] of [
  ["a dated page with no sitemap row", builderPath, '  ["claude-code-theme-install-guide.html", "monthly", "0.82"],\n', "",
    /claude-code-theme-install-guide\.html is a dated page with no sitemap entry; add it to FIXED_SITEMAP_PAGES/],
  ["a dated page whose dates cannot be read", "claude-code-theme-install-guide.html", '"dateModified":', '"dateChanged":',
    /claude-code-theme-install-guide\.html does not state one datePublished and dateModified/],
]) {
  test(`the builder refuses ${defect}`, { timeout: 120_000 }, async (t) => {
    const fixtureRoot = await makeFixture(t);
    const file = join(fixtureRoot, path);
    const text = await readFile(file, "utf8");
    assert.equal(text.split(from).length, 2, `fixture anchor must occur exactly once in ${path}: ${from}`);
    await writeFile(file, text.replace(from, () => to));

    const rebuilt = await runScript(fixtureRoot, builderPath);

    assert.notEqual(rebuilt.code, 0, `the builder wrote a sitemap for ${defect}`);
    assert.match(rebuilt.stderr, message);
  });
}
