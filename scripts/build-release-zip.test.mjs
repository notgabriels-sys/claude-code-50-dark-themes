import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;
const script = join(repoRoot, "scripts", "build-release-zip.sh");
const hasZipTools = ["zip", "unzip"].every(
  (tool) => spawnSync("sh", ["-c", `command -v ${tool}`]).status === 0,
);

function run(args, options = {}) {
  return spawnSync("bash", [script, ...args], { encoding: "utf8", ...options });
}

test("rejects a tag that is not themes-plugin-vMAJOR.MINOR.PATCH", () => {
  for (const tag of ["v1.0.1", "themes-plugin-v1.0", "themes-plugin-v1.0.1-rc1", "main"]) {
    const result = run([repoRoot, tag, tmpdir()]);
    assert.notEqual(result.status, 0, `tag ${tag} should be rejected`);
    assert.match(result.stderr, /Unexpected tag/);
  }
});

test("packs every plugin's theme files exactly as checked in", { skip: !hasZipTools }, () => {
  const out = mkdtempSync(join(tmpdir(), "release-zip-"));
  try {
    const result = run([repoRoot, "themes-plugin-v0.0.0", out]);
    assert.equal(result.status, 0, result.stderr);

    const zips = readdirSync(out).filter((name) => name.endsWith(".zip"));
    assert.deepEqual(zips, ["claude-code-dark-themes-v0.0.0.zip"]);

    const listing = execFileSync("unzip", ["-Z1", join(out, zips[0])], { encoding: "utf8" })
      .trim()
      .split("\n");
    const expectedThemes = readdirSync(join(repoRoot, "plugins"))
      .flatMap((plugin) =>
        readdirSync(join(repoRoot, "plugins", plugin, "themes"))
          .filter((file) => file.endsWith(".json"))
          .map((file) => `claude-code-dark-themes-v0.0.0/${plugin}/themes/${file}`),
      )
      .sort();
    const packedThemes = listing.filter((entry) => /\/themes\/[^/]+\.json$/.test(entry)).sort();
    assert.deepEqual(packedThemes, expectedThemes);
    assert.equal(packedThemes.length, 62);

    for (const plugin of readdirSync(join(repoRoot, "plugins"))) {
      assert.ok(listing.includes(`claude-code-dark-themes-v0.0.0/${plugin}/LICENSE`));
      assert.ok(listing.includes(`claude-code-dark-themes-v0.0.0/${plugin}/README.md`));
    }
    assert.ok(listing.includes("claude-code-dark-themes-v0.0.0/INSTALL.txt"));

    const install = execFileSync(
      "unzip",
      ["-p", join(out, zips[0]), "claude-code-dark-themes-v0.0.0/INSTALL.txt"],
      { encoding: "utf8" },
    );
    assert.match(install, /^Dark themes for Claude Code, release themes-plugin-v0\.0\.0\n62 theme files/);
    assert.match(install, /cp 50-dark-themes\/themes\/\*\.json ~\/\.claude\/themes\//);
    assert.match(install, /cp dark-themes-vol-2\/themes\/\*\.json ~\/\.claude\/themes\//);
    assert.doesNotMatch(install, /gumroad/i);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
