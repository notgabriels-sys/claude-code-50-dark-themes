import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const installer = join(repoRoot, "install.sh");

// Each test gets its own HOME, so the default ~/.claude/themes is a fresh folder.
function sandbox(t) {
  const home = mkdtempSync(join(tmpdir(), "install-sh-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return { home, themes: join(home, ".claude", "themes") };
}

function run(home, args) {
  return spawnSync("bash", [installer, ...args], { encoding: "utf8", env: { ...process.env, HOME: home } });
}

const installed = (dir) => (existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".json")).sort() : []);

test("refuses a name that is not in the pack and changes nothing", (t) => {
  const { home, themes } = sandbox(t);

  const result = run(home, ["acid", "deepfield"]);

  assert.equal(result.status, 1, `a mistyped name was accepted:\n${result.stdout}`);
  assert.match(result.stderr, /No theme matched: deepfield\b/);
  assert.deepEqual(installed(themes), [], "the names that did match were installed anyway");
});

test("--uninstall with names removes only those", (t) => {
  const { home, themes } = sandbox(t);
  run(home, []);
  assert.equal(installed(themes).length, 50);

  const result = run(home, ["--uninstall", "acid", "deep-field"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Removed 2 theme\(s\)/);
  assert.equal(installed(themes).length, 48, "naming two themes removed a different number");
  assert.ok(!installed(themes).includes("acid.json") && !installed(themes).includes("deep-field.json"));
});
