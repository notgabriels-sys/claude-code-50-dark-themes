import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
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

// An expansion tag must carry the version its plugin manifest states, so the
// test reads the real one instead of inventing a version.
const VOL2 = "dark-themes-vol-2";
const vol2Manifest = JSON.parse(
  readFileSync(join(repoRoot, "plugins", VOL2, ".claude-plugin", "plugin.json"), "utf8"),
);
const VOL2_TAG = `${VOL2}-v${vol2Manifest.version}`;
const VOL2_ROOT = `claude-code-${VOL2}-v${vol2Manifest.version}`;

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

test("rejects an expansion tag that is not dark-themes-vol-N-vMAJOR.MINOR.PATCH", () => {
  const tags = [
    "dark-themes-vol-2-v1.0",
    "dark-themes-vol-2",
    "dark-themes-vol-0-v1.0.0",
    "dark-themes-vol-02-v1.0.0",
    "dark-themes-vol-2-v1.0.0-rc1",
    "dark-themes-vol-2-v01.0.0",
    "vol-2-v1.0.0",
    "50-dark-themes-v1.0.1",
  ];
  for (const tag of tags) {
    const result = run([repoRoot, tag, tmpdir()]);
    assert.notEqual(result.status, 0, `tag ${tag} should be rejected`);
    assert.match(result.stderr, /Unexpected tag/);
  }
});

test("packs only the named expansion for a dark-themes-vol-N tag", { skip: !hasZipTools }, () => {
  const out = mkdtempSync(join(tmpdir(), "release-zip-vol2-"));
  try {
    const result = run([repoRoot, VOL2_TAG, out]);
    assert.equal(result.status, 0, result.stderr);

    const zips = readdirSync(out).filter((name) => name.endsWith(".zip"));
    assert.deepEqual(zips, [`${VOL2_ROOT}.zip`]);
    const listing = zipEntries(join(out, zips[0]));

    const expectedThemes = readdirSync(join(repoRoot, "plugins", VOL2, "themes"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => `${VOL2_ROOT}/${VOL2}/themes/${file}`)
      .sort();
    assert.ok(expectedThemes.length > 0, "the checkout should hold the Vol. 2 themes");
    const packedThemes = listing.filter((entry) => /\/themes\/[^/]+\.json$/.test(entry)).sort();
    assert.deepEqual(packedThemes, expectedThemes);
    assert.ok(
      !listing.some((entry) => entry.includes("/50-dark-themes/")),
      "the 50-theme pack must not ride along in an expansion zip",
    );
    for (const file of ["LICENSE", "README.md", ".claude-plugin/plugin.json"]) {
      assert.ok(listing.includes(`${VOL2_ROOT}/${VOL2}/${file}`), `${file} missing`);
    }
    assert.ok(listing.includes(`${VOL2_ROOT}/INSTALL.txt`));

    const install = execFileSync("unzip", ["-p", join(out, zips[0]), `${VOL2_ROOT}/INSTALL.txt`], {
      encoding: "utf8",
    });
    assert.match(
      install,
      new RegExp(`^Dark Themes Vol\\. 2 for Claude Code, release ${VOL2_TAG}\\n${expectedThemes.length} theme files`),
    );
    assert.match(install, new RegExp(`Manual install \\(run from this folder, ${VOL2_ROOT}\\):`));
    assert.match(install, /claude plugin install dark-themes-vol-2@notgabriels-themes/);
    assert.match(install, /cp dark-themes-vol-2\/themes\/\*\.json ~\/\.claude\/themes\//);
    assert.doesNotMatch(install, /claude plugin install 50-dark-themes@/);
    assert.doesNotMatch(install, /cp 50-dark-themes\//);
    assert.match(result.stdout, new RegExp(`^${expectedThemes.length} theme files from ${VOL2_TAG} packed into `));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("rejects an expansion tag whose version disagrees with the plugin manifest", () => {
  assert.notEqual(vol2Manifest.version, "0.0.0", "the manifest version must differ from the probe tag");
  const result = run([repoRoot, `${VOL2}-v0.0.0`, tmpdir()]);
  assert.notEqual(result.status, 0, "a tag whose version the manifest does not carry should be rejected");
  assert.match(result.stderr, /plugin\.json says/);
});

test("rejects an expansion tag for a volume the checkout does not contain", () => {
  assert.ok(!existsSync(join(repoRoot, "plugins", "dark-themes-vol-99")));
  const result = run([repoRoot, "dark-themes-vol-99-v1.0.0", tmpdir()]);
  assert.notEqual(result.status, 0, "a tag naming a missing plugin directory should be rejected");
  assert.match(result.stderr, /does not exist at this tag/);
});
