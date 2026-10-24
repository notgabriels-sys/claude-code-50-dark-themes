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

// CLAUDE_CONFIG_DIR moves the folder Claude Code reads themes from, so it is
// cleared unless a test sets it.
function run(home, args, extraEnv = {}) {
  const env = { ...process.env, HOME: home, ...extraEnv };
  if (!("CLAUDE_CONFIG_DIR" in extraEnv)) delete env.CLAUDE_CONFIG_DIR;
  return spawnSync("bash", [installer, ...args], { encoding: "utf8", env });
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

// Claude Code picks up ~/.claude/themes only if the folder existed when it
// started. Checked live on 2.1.302: installing into a folder this script
// created left the 50 themes out of /theme until a restart.
test("says to restart Claude Code once when it creates the themes folder", (t) => {
  const { home } = sandbox(t);

  const first = run(home, []);
  const again = run(home, []);

  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /restart Claude Code once/i);
  assert.doesNotMatch(again.stdout, /restart/i, "the folder already existed, so no restart is needed");
});

// Claude Code reads custom themes only from <config dir>/themes. A --dir
// anywhere else is never listed, so the restart note there was false.
test("says /theme won't list themes installed outside Claude Code's themes folder", (t) => {
  const { home } = sandbox(t);

  const elsewhere = run(home, ["--dir", join(home, "elsewhere"), "acid"]);

  assert.equal(elsewhere.status, 0, elsewhere.stderr);
  assert.match(elsewhere.stdout, /Claude Code reads themes from .*\/\.claude\/themes, so \/theme won't list these/);
  assert.doesNotMatch(elsewhere.stdout, /restart/i, "a restart never makes Claude Code read another folder");
});

test("follows CLAUDE_CONFIG_DIR to the folder Claude Code reads", (t) => {
  const { home } = sandbox(t);
  const config = join(home, "cfg");

  const there = run(home, ["--dir", join(config, "themes"), "acid"], { CLAUDE_CONFIG_DIR: config });
  const defaultDest = run(home, ["acid"], { CLAUDE_CONFIG_DIR: config });

  assert.match(there.stdout, /restart Claude Code once/i, "--dir at Claude Code's own themes folder lost the restart note");
  assert.match(defaultDest.stdout, /Claude Code reads themes from .*\/cfg\/themes, so \/theme won't list these/);
});
