import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

import { SCRIPT, STYLED_PAGES, STYLESHEET, TOKENS, outsideMotionGate, pageProblems, stylesheetProblems } from "./site-style.mjs";

const root = new URL("../", import.meta.url);
const css = await readFile(new URL(STYLESHEET, root), "utf8");

const lights = '<div class="lights" aria-hidden="true"><span class="l1"></span><span class="l2"></span><span class="l3"></span></div>';
const button = '<button class="theme-switch" id="theme-switch" type="button" aria-label="Switch to light mode"><span class="knob" aria-hidden="true"></span><span class="label">Light mode</span></button>';
const page = ({ head = `<link rel="stylesheet" href="${STYLESHEET}">\n<script src="${SCRIPT}"></script>`, body = `${lights}\n<main></main>\n${button}` } = {}) =>
  `<!doctype html>\n<html lang="en">\n<head>\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
const bad = (problems, pattern, label) => {
  assert.ok(problems.length > 0, `${label}: a problem is reported`);
  assert.match(problems.join("\n"), pattern, label);
};

test("site style: the shipped stylesheet and every styled page pass", async () => {
  assert.deepEqual(stylesheetProblems(css), []);
  for (const path of STYLED_PAGES) assert.deepEqual(pageProblems(path, await readFile(new URL(path, root), "utf8")), [], path);
});

test("site style: an animation or transition outside the reduced-motion block fails, inside passes", () => {
  bad(stylesheetProblems(`${css}\n.x { animation: spin 1s infinite; }`), /reduced-motion/, "bare animation");
  bad(stylesheetProblems(`${css}\n.x{transition:opacity .2s}`), /reduced-motion/, "bare transition");
  bad(stylesheetProblems(`${css}\n.x { animation-name: spin; }`), /reduced-motion/, "longhand animation");
  bad(stylesheetProblems(`${css}\n@media (prefers-reduced-motion: reduce) { .x { animation: spin 1s; } }`), /reduced-motion/, "the opposite query");
  bad(stylesheetProblems(`${css}\n@media (prefers-reduced-motion: no-preference) { .x { animation: spin 1s; }`), /does not close/, "unclosed block");
  assert.deepEqual(stylesheetProblems(`${css}\n@media (prefers-reduced-motion: no-preference) { .x { animation: spin 1s; } @keyframes spin { to { transform: rotate(1turn); } } }`), []);
  assert.deepEqual(stylesheetProblems(`${css}\n/* .x { animation: spin 1s; } */`), [], "a comment is not a rule");
  assert.equal(/animation/.test(outsideMotionGate("@media (prefers-reduced-motion:no-preference){.a{animation:x 1s}}").text), false);
});

test("site style: each palette holds the house colours", () => {
  bad(stylesheetProblems(css.replace("--accent: #A898FF;", "--accent: #7A8CFF;")), /--accent in the dark palette is #7A8CFF/, "dark accent");
  const lightRule = ':root[data-theme="light"] {\n  --bg: #F2F1F6;';
  assert.ok(css.includes(lightRule));
  bad(stylesheetProblems(css.replace(lightRule, ':root[data-theme="light"] {\n  --bg: #FFFFFF;')), /--bg in the light palette/, "light bg");
  bad(stylesheetProblems(css.replace("@media (prefers-color-scheme: light)", "@media (prefers-contrast: more)")), /visitor's light preference/, "no light preference");
  bad(stylesheetProblems(css.replace("  --ember: #FFB46B;\n", "")), /--ember in the dark palette is missing/, "missing token");
  assert.equal(TOKENS.dark.muted, "#9C99AA");
});

test("site style: a styled page links the stylesheet and script, opens with the lights and carries one switch", () => {
  assert.deepEqual(pageProblems("p.html", page()), []);
  bad(pageProblems("p.html", page({ head: `<script src="${SCRIPT}"></script>` })), /must link assets\/site\.css/, "no stylesheet");
  bad(pageProblems("p.html", page({ head: `<link rel="stylesheet" href="${STYLESHEET}">` })), /must load assets\/site\.js/, "no script");
  bad(pageProblems("p.html", page({ head: `<link rel="stylesheet" href="${STYLESHEET}">\n<script defer src="${SCRIPT}"></script>` })), /must load assets\/site\.js/, "deferred script");
  bad(pageProblems("p.html", page({ head: "", body: `<link rel="stylesheet" href="${STYLESHEET}"><script src="${SCRIPT}"></script>${lights}${button}` })), /in its head/, "linked from the body");
  bad(pageProblems("p.html", page({ body: `<main></main>${lights}${button}` })), /must open the body/, "lights not first");
  bad(pageProblems("p.html", page({ body: `${lights}<main></main>` })), /exactly one/, "no switch");
  bad(pageProblems("p.html", page({ body: `${lights}${button}${button}` })), /exactly one/, "two switches");
  bad(pageProblems("p.html", page({ body: `${lights}${button.replace(' type="button"', "")}` })), /type="button"/, "a submit button");
  bad(pageProblems("p.html", page({ body: `${lights}${button.replace(/ aria-label="[^"]+"/, "")}` })), /aria-label/, "no name");
});

// A minimal document for assets/site.js: one root element, one button, storage, a media query.
function runScript({ saved = null, prefersLight = false } = {}) {
  const attrs = {};
  const listeners = {};
  const store = new Map(saved ? [["familiars-theme", saved]] : []);
  const label = { textContent: "" };
  const buttonAttrs = {};
  const button = { setAttribute: (k, v) => (buttonAttrs[k] = v), querySelector: () => label, addEventListener: (t, f) => (listeners[`button:${t}`] = f) };
  const root = { getAttribute: (k) => attrs[k] ?? null, setAttribute: (k, v) => (attrs[k] = v) };
  const context = {
    document: { documentElement: root, getElementById: (id) => (id === "theme-switch" ? button : null), addEventListener: (t, f) => (listeners[t] = f) },
    window: { matchMedia: () => ({ matches: prefersLight, addEventListener() {} }) },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  };
  return { context, attrs, store, label, buttonAttrs, listeners };
}

test("site style: the switch script restores a saved mode before paint, follows the system otherwise, and remembers a click", async () => {
  const source = await readFile(new URL(SCRIPT, root), "utf8");
  const saved = runScript({ saved: "light" });
  vm.runInNewContext(source, saved.context);
  assert.equal(saved.attrs["data-theme"], "light", "saved choice applied at once");
  assert.equal(saved.attrs["data-eff"], "light");

  const system = runScript({ prefersLight: true });
  vm.runInNewContext(source, system.context);
  assert.equal(system.attrs["data-theme"], undefined, "no choice is invented");
  assert.equal(system.attrs["data-eff"], "light");

  const fresh = runScript();
  vm.runInNewContext(source, fresh.context);
  fresh.listeners.DOMContentLoaded();
  assert.equal(fresh.label.textContent, "Light mode");
  assert.equal(fresh.buttonAttrs["aria-label"], "Switch to light mode");
  fresh.listeners["button:click"]();
  assert.equal(fresh.attrs["data-theme"], "light");
  assert.equal(fresh.store.get("familiars-theme"), "light");
  assert.equal(fresh.label.textContent, "Dark mode");

  const junk = runScript({ saved: "sepia" });
  vm.runInNewContext(source, junk.context);
  assert.equal(junk.attrs["data-theme"], undefined, "an unknown saved value is ignored");
});

// --- the contrast verifier on a copy of the repository --------------------------------------

async function contrastRun(t, change) {
  const projectRoot = fileURLToPath(root);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gabs-site-style-"));
  const fixtureRoot = join(temporaryRoot, "repo");
  await cp(projectRoot, fixtureRoot, {
    recursive: true,
    filter: (source) => ![".git", "node_modules"].some((d) => { const r = relative(projectRoot, source); return r === d || r.startsWith(`${d}${sep}`); }),
  });
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  await change(fixtureRoot);
  try {
    return { ok: true, out: execFileSync(process.execPath, ["scripts/verify-contrast.mjs"], { cwd: fixtureRoot, encoding: "utf8", stdio: "pipe" }) };
  } catch (error) {
    return { ok: false, out: `${error.stdout}${error.stderr}` };
  }
}
const edit = (path, from, to) => async (dir) => {
  const text = await readFile(join(dir, path), "utf8");
  assert.ok(text.includes(from), `${path} holds ${from}`);
  await writeFile(join(dir, path), text.replaceAll(from, to));
};

test("site style: the storefront's text holds 4.5:1 in light mode too, and the shared sample keeps its own ink", async (t) => {
  const passing = await contrastRun(t, async () => {});
  assert.ok(passing.ok, passing.out);
  assert.match(passing.out, /894 role-aware contrast comparisons/, "the light checks do not change the stated total");

  const pale = await contrastRun(t, edit(STYLESHEET, "--muted: #5C5A6A; --line: #DAD8E2;", "--muted: #9C99AA; --line: #DAD8E2;"));
  assert.equal(pale.ok, false);
  assert.match(pale.out, /light mode\): --mute on --ground is \d/);

  const drift = await contrastRun(t, edit("index.html", ".cmd,.step code,code.inline{--ink:#e9eaec;", ".cmd,.step code,code.inline{--ink:#eeeeee;"));
  assert.equal(drift.ok, false);
  assert.match(drift.out, /--ink #e9eaec does not match storefront #eeeeee/);

  const unknown = await contrastRun(t, edit("index.html", "--hair:var(--line);", "--hair:var(--line);\n    --faint:var(--nowhere);"));
  assert.equal(unknown.ok, false, "a token pointing at nothing fails");
});
