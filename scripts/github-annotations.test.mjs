import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_MESSAGE, annotation, escapeData, escapeProperty, testFailure, uncaughtMessage } from "./github-annotations.mjs";

const reporter = fileURLToPath(new URL("./github-annotations.mjs", import.meta.url));
const errors = (text) => text.split("\n").filter((line) => line.startsWith("::error"));

test("annotations: data and properties are escaped so a command cannot end early", () => {
  assert.equal(escapeData("100%\r\nnext"), "100%25%0D%0Anext");
  assert.equal(escapeProperty("a: b, c%"), "a%3A b%2C c%25");
  // `%` goes first, or the escapes themselves would be escaped again.
  assert.equal(escapeData("%0A"), "%250A");
});

test("annotations: one error line, with file, line and title only when known", () => {
  assert.equal(annotation({ title: "T: x", file: "scripts/a.test.mjs", line: 7, message: "one\ntwo" }), "::error file=scripts/a.test.mjs,line=7,title=T%3A x::one%0Atwo\n");
  assert.equal(annotation({ title: "verify failed", message: "  boom \n" }), "::error title=verify failed::boom\n");
  assert.equal(annotation({ line: 3, message: "" }), "::error::(no message)\n");
  const long = annotation({ message: "x".repeat(MAX_MESSAGE + 50) });
  assert.ok(long.length < MAX_MESSAGE + 100, "a long message is cut");
  assert.match(long, /cut; the job log has the rest/);
  assert.equal(errors(long).length, 1);
});

test("annotations: the verifier's message is read from Node's own uncaught-error output", () => {
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", 'function fail(m) { throw new Error(m); }\nfail("README.md states 51 themes;\\nthe pack ships 50.");'], { encoding: "utf8" });
  assert.notEqual(run.status, 0);
  assert.equal(uncaughtMessage(run.stderr), "README.md states 51 themes;\nthe pack ships 50.");
  assert.equal(uncaughtMessage("TypeError [ERR_X]: bad\n    at x (y:1:1)\n"), "bad");
  assert.equal(uncaughtMessage("killed by a signal\n"), "killed by a signal");
});

test("annotations: the command-line use prints one annotation for a failure and nothing for no output", () => {
  const failed = spawnSync(process.execPath, [reporter, "verify failed"], { input: "file:///x.mjs:1\n\nError: one, two\n    at fail (x)\n\nNode.js v22\n", encoding: "utf8" });
  assert.equal(failed.status, 0);
  assert.equal(failed.stdout, "::error title=verify failed::one, two\n");
  const quiet = spawnSync(process.execPath, [reporter, "verify failed"], { input: "", encoding: "utf8" });
  assert.equal(quiet.stdout, "");
});

test("annotations: a failure that is only a failed subtest is not annotated twice", () => {
  assert.equal(testFailure({ name: "parent", details: { error: { code: "ERR_TEST_FAILURE", failureType: "subtestsFailed" } } }), null);
  assert.equal(testFailure({ name: "passed", details: {} }), null);
  const failure = testFailure({ name: "t", file: "/repo/scripts/a.test.mjs", line: 2, details: { error: Object.assign(new Error("wrapper"), { code: "ERR_TEST_FAILURE", failureType: "testCodeFailure", cause: new Error("the real reason") }) } }, "/repo");
  assert.deepEqual(failure, { title: "Test failed: t", file: "scripts/a.test.mjs", line: 2, message: "the real reason" });
});

test("annotations: as a test reporter, each failing test becomes one annotation naming it", () => {
  const dir = mkdtempSync(join(tmpdir(), "annotations-"));
  try {
    writeFileSync(
      join(dir, "demo.test.mjs"),
      [
        'import test from "node:test";',
        'import assert from "node:assert/strict";',
        'test("passes", () => {});',
        'test("fails, plainly", () => { assert.equal(1, 2); });',
        'test("parent", async (t) => { await t.test("child throws", () => { throw new Error("boom"); }); });',
        "",
      ].join("\n"),
    );
    // A run started inside the test runner reports to it unless it is told it is its own run.
    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ["--test", `--test-reporter=${reporter}`, "--test-reporter-destination=stdout", "demo.test.mjs"], { cwd: dir, encoding: "utf8", env: childEnv });
    assert.notEqual(run.status, 0, "the run still fails");
    const lines = errors(run.stdout);
    assert.equal(lines.length, 2, run.stdout);
    assert.match(lines[0], /^::error file=demo\.test\.mjs,line=4,title=Test failed%3A fails%2C plainly::Expected values to be strictly equal/);
    assert.equal(lines[1], "::error file=demo.test.mjs,line=5,title=Test failed%3A child throws::boom");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
