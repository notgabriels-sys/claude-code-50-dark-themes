import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const script = join(repoRoot, "scripts", "build-release-zip.sh");
const hasZipTools = ["zip", "unzip"].every(
  (tool) => spawnSync("sh", ["-c", `command -v ${tool}`]).status === 0,
);
if (process.env.CI && !hasZipTools) {
  throw new Error("zip and unzip must be installed on CI so the release zip is actually checked.");
}

// The script packs every directory under plugins/ that has a themes/ folder.
const plugins = readdirSync(join(repoRoot, "plugins")).filter(
  (entry) =>
    statSync(join(repoRoot, "plugins", entry)).isDirectory() &&
    existsSync(join(repoRoot, "plugins", entry, "themes")),
);
const TAG = "themes-plugin-v0.0.0";
const ROOT = "claude-code-dark-themes-v0.0.0";

function run(args, options = {}) {
  return spawnSync("bash", [script, ...args], { encoding: "utf8", ...options });
}

function zipEntries(zipfile) {
  return execFileSync("unzip", ["-Z1", zipfile], { encoding: "utf8" }).trim().split("\n");
}

test("rejects a tag that is not themes-plugin-vMAJOR.MINOR.PATCH", () => {
  const tags = ["v1.0.1", "themes-plugin-v1.0", "themes-plugin-v1.0.1-rc1", "themes-plugin-v01.0.1", "main"];
  for (const tag of tags) {
    const result = run([repoRoot, tag, tmpdir()]);
    assert.notEqual(result.status, 0, `tag ${tag} should be rejected`);
    assert.match(result.stderr, /Unexpected tag/);
  }
});

test("packs every plugin's theme files exactly as checked in", { skip: !hasZipTools }, () => {
  const out = mkdtempSync(join(tmpdir(), "release-zip-"));
  try {
    const result = run([repoRoot, TAG, out]);
    assert.equal(result.status, 0, result.stderr);

    const zips = readdirSync(out).filter((name) => name.endsWith(".zip"));
    assert.deepEqual(zips, [`${ROOT}.zip`]);
    const listing = zipEntries(join(out, zips[0]));

    const expectedThemes = plugins
      .flatMap((plugin) =>
        readdirSync(join(repoRoot, "plugins", plugin, "themes"))
          .filter((file) => file.endsWith(".json"))
          .map((file) => `${ROOT}/${plugin}/themes/${file}`),
      )
      .sort();
    assert.ok(expectedThemes.length >= 50, "the checkout should hold at least the 50 original themes");
    const packedThemes = listing.filter((entry) => /\/themes\/[^/]+\.json$/.test(entry)).sort();
    assert.deepEqual(packedThemes, expectedThemes);

    for (const plugin of plugins) {
      assert.ok(listing.includes(`${ROOT}/${plugin}/LICENSE`), `${plugin} LICENSE missing`);
      assert.ok(listing.includes(`${ROOT}/${plugin}/README.md`), `${plugin} README missing`);
    }
    assert.ok(listing.includes(`${ROOT}/INSTALL.txt`));

    const install = execFileSync("unzip", ["-p", join(out, zips[0]), `${ROOT}/INSTALL.txt`], {
      encoding: "utf8",
    });
    assert.match(
      install,
      new RegExp(`^Dark themes for Claude Code, release ${TAG}\\n${expectedThemes.length} theme files`),
    );
    assert.match(install, new RegExp(`Manual install \\(run from this folder, ${ROOT}\\):`));
    for (const plugin of plugins) {
      assert.match(install, new RegExp(`claude plugin install ${plugin}@notgabriels-themes`));
      assert.match(install, new RegExp(`cp ${plugin}/themes/\\*\\.json ~/\\.claude/themes/`));
    }
    assert.match(install, /restart Claude Code once/);
    assert.doesNotMatch(install, /gumroad/i);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("writes a relative OUT_DIR under the caller's directory, as the workflow does", { skip: !hasZipTools }, () => {
  const cwd = mkdtempSync(join(tmpdir(), "release-zip-cwd-"));
  try {
    const result = run([repoRoot, TAG, "dist"], { cwd });
    assert.equal(result.status, 0, result.stderr);
    const zipfile = join(cwd, "dist", `${ROOT}.zip`);
    assert.ok(existsSync(zipfile), `expected ${zipfile}`);
    assert.match(result.stdout, new RegExp(`theme files from ${TAG} packed into ${zipfile}`));
    assert.ok(zipEntries(zipfile).includes(`${ROOT}/INSTALL.txt`));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
