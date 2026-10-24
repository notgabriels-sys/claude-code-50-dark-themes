import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

async function makeFixture(t) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gabs-familiars-verify-"));
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

async function editFile(fixtureRoot, path, edit) {
  const file = join(fixtureRoot, path);
  const before = await readFile(file, "utf8");
  const after = edit(before);
  assert.notEqual(after, before, `the test edit did not change ${path}`);
  await writeFile(file, after);
}

test("rejects a Familiars page whose stated count drifts from its cards", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editFile(fixtureRoot, "familiars.html", (html) =>
    html.replace("<h2>Seven familiars, each with its sigil.</h2>", "<h2>Eight familiars, each with its sigil.</h2>"),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a count the page does not show");
  assert.match(result.stderr, /Familiars: the heading says Eight familiars but the page shows 7 cards\./);
});

test("rejects a Familiars page that drops a card but keeps the count", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editFile(fixtureRoot, "familiars.html", (html) =>
    html.replace(/<article class="card" data-kind="theme">[\s\S]*?<\/article>/, ""),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted seven claimed familiars on a page of six");
  assert.match(result.stderr, /the page shows 6 cards/);
});

test("rejects a Familiars page without the Impressum link", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editFile(fixtureRoot, "familiars.html", (html) =>
    html.replace('<a href="impressum.html">Impressum</a>', ""),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a public page with no Impressum link");
  assert.match(result.stderr, /Familiars page is missing: Impressum link\./);
});

test("rejects a Familiars page that names a project not sold here", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editFile(fixtureRoot, "familiars.html", (html) =>
    html.replace("built in a Berlin studio", "built in the Slow Foundry studio"),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a forbidden name on the Familiars page");
  assert.match(result.stderr, /Familiars: the page must not name Slow Foundry\./);
});

test("rejects a Familiars page whose X alt disagrees with its Open Graph alt", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editFile(fixtureRoot, "familiars.html", (html) =>
    html.replace(/<meta name="twitter:image:alt" content="[^"]+">/, '<meta name="twitter:image:alt" content="Something else">'),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted two descriptions of one share image");
  assert.match(result.stderr, /Familiars: og:image:alt and twitter:image:alt must both exist and say the same thing\./);
});

test("rejects a Familiars share image of the wrong size", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  const image = join(fixtureRoot, "assets/familiars-share.png");
  const data = await readFile(image);
  data.writeUInt32BE(1200, 16);
  await writeFile(image, data);

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a share image that is not 1280x720");
  assert.match(result.stderr, /Familiars share image must be 1280x720: assets\/familiars-share\.png\./);
});

test("rejects a storefront that stops linking the Familiars page", { timeout: 90_000 }, async (t) => {
  const fixtureRoot = await makeFixture(t);
  await editFile(fixtureRoot, "index.html", (html) =>
    html.replace(/\s*<span><a href="familiars\.html">[^<]+<\/a><\/span>/, ""),
  );

  const result = await runVerifier(fixtureRoot);

  assert.notEqual(result.code, 0, "the verifier accepted a storefront with no way to the Familiars page");
  assert.match(result.stderr, /The storefront must link the Familiars page \(familiars\.html\)\./);
});
