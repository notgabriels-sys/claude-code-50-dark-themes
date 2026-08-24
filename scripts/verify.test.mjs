import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const coverPath = "assets/products/dark-ui-kit.png";

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
