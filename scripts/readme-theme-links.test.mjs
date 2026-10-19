import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { loadThemes } from "./build-theme-pages.mjs";

const root = new URL("../", import.meta.url);
const projectRoot = fileURLToPath(root);
const themePageUrl = "https://gabs-utilities.com/theme/";
const readmePaths = ["README.md", "plugins/50-dark-themes/README.md", "plugins/dark-themes-vol-2/README.md"];

async function makeFixture(t) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gabs-readme-links-"));
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

// Replaces one exact occurrence of `from` in a fixture file; the test fails if the text it
// means to break is not there exactly once, so a wording change cannot silently defuse it.
async function editOnce(fixtureRoot, path, from, to) {
  const file = join(fixtureRoot, path);
  const text = await readFile(file, "utf8");
  assert.equal(text.split(from).length, 2, `${path} contains ${JSON.stringify(from)} exactly once`);
  await writeFile(file, text.replace(from, to));
}

const pageLink = (theme) => `[${theme.name}](${themePageUrl}${theme.slug}/)`;

test("the READMEs link every theme by name to a theme page that exists in the repository", async () => {
  const themes = await loadThemes(root);
  assert.equal(themes.length, 62);
  const [readme, fiftyReadme, vol2Readme] = await Promise.all(
    readmePaths.map((path) => readFile(new URL(path, root), "utf8")),
  );

  for (const theme of themes) {
    assert.ok(readme.includes(pageLink(theme)), `README.md links ${theme.name}'s page`);
    if (theme.pack.id === "dark-themes-vol-2") {
      assert.ok(vol2Readme.includes(`| ${pageLink(theme)} |`), `the Vol. 2 README table links ${theme.name}'s page`);
    }
    const page = await stat(new URL(`theme/${theme.slug}/index.html`, root));
    assert.ok(page.isFile(), `theme/${theme.slug}/index.html exists`);
  }
  assert.match(fiftyReadme, /^https:\/\/gabs-utilities\.com\/theme\/$/m, "the 50-theme README links the page index");

  const slugs = new Set(themes.map((theme) => theme.slug));
  for (const [path, markdown] of [["README.md", readme], [readmePaths[1], fiftyReadme], [readmePaths[2], vol2Readme]]) {
    for (const [, rest] of markdown.matchAll(/https:\/\/gabs-utilities\.com\/theme\/([^\s)]*)/g)) {
      if (rest === "") continue;
      assert.ok(slugs.has(rest.replace(/\/$/, "")), `${path} links a page that exists: ${themePageUrl}${rest}`);
    }
  }
});

test("the verifier rejects a README name that opens another theme's page", async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editOnce(fixtureRoot, "README.md", `[Acid](${themePageUrl}acid/)`, `[Acid](${themePageUrl}absinthe/)`);

  const result = await runVerifier(fixtureRoot);
  assert.notEqual(result.code, 0, "the verifier accepted a theme name linked to a different theme's page");
  assert.match(result.stderr, /README\.md links https:\/\/gabs-utilities\.com\/theme\/absinthe\/ as "Acid"; that page is Absinthe's\./);
});

test("the verifier rejects a README link to a theme page that does not exist", async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editOnce(fixtureRoot, "plugins/dark-themes-vol-2/README.md", `[Ozone](${themePageUrl}ozone/)`, `[Ozone](${themePageUrl}ozone-layer/)`);

  const result = await runVerifier(fixtureRoot);
  assert.notEqual(result.code, 0, "the verifier accepted a link to a theme page that does not exist");
  assert.match(
    result.stderr,
    /plugins\/dark-themes-vol-2\/README\.md links https:\/\/gabs-utilities\.com\/theme\/ozone-layer\/, but no theme page has that address\./,
  );
});

test("the verifier rejects a README list that leaves a theme unlinked", async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editOnce(fixtureRoot, "README.md", pageLink({ name: "Velvet", slug: "velvet" }), "Velvet");

  const result = await runVerifier(fixtureRoot);
  assert.notEqual(result.code, 0, "the verifier accepted a README that names Velvet without linking its page");
  assert.match(result.stderr, /README\.md does not link Velvet's page \(https:\/\/gabs-utilities\.com\/theme\/velvet\/\)\./);
});

test("the verifier rejects a Vol. 2 plugin README that leaves one of its twelve unlinked", async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editOnce(fixtureRoot, "plugins/dark-themes-vol-2/README.md", `| ${pageLink({ name: "Basalt", slug: "basalt" })} |`, "| Basalt |");

  const result = await runVerifier(fixtureRoot);
  assert.notEqual(result.code, 0, "the verifier accepted a Vol. 2 README whose table names Basalt without its page");
  assert.match(result.stderr, /plugins\/dark-themes-vol-2\/README\.md does not link Basalt's page/);
});

test("the verifier rejects a 50-theme plugin README without the theme page index", async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editOnce(fixtureRoot, "plugins/50-dark-themes/README.md", "\nhttps://gabs-utilities.com/theme/\n", "\nhttps://gabs-utilities.com/\n");

  const result = await runVerifier(fixtureRoot);
  assert.notEqual(result.code, 0, "the verifier accepted a plugin README that lost the page index link");
  assert.match(result.stderr, /plugins\/50-dark-themes\/README\.md must link the theme page index https:\/\/gabs-utilities\.com\/theme\//);
});
