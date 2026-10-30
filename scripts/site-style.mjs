// The site base in the Familiars look: assets/site.css (tokens, ambient lights, light/dark switch)
// and assets/site.js (remembers the switch). verify.mjs runs these rules; the tests are in
// scripts/site-style.test.mjs. Pages move onto the base one at a time: add each to STYLED_PAGES.

export const STYLESHEET = "assets/site.css";
export const SCRIPT = "assets/site.js";
export const STYLED_PAGES = ["index.html"];

// The palette in /mnt/project-files/design/STYLE.md (the Familiars page), dark first.
export const TOKENS = {
  dark: { bg: "#0F0F13", surface: "#16161C", raise: "#1C1C24", fg: "#EDEBF3", muted: "#9C99AA", line: "#2A2933", accent: "#A898FF", ember: "#FFB46B" },
  light: { bg: "#F2F1F6", surface: "#FFFFFF", raise: "#F8F7FB", fg: "#16151C", muted: "#5C5A6A", line: "#DAD8E2", accent: "#5A45D6", ember: "#B8601A" },
};

const MOTION_GATE = /@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)\s*\{/g;
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

// The body of the block whose opening brace is at `open`, or null when the braces do not close.
function blockEnd(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

// The stylesheet with every reduced-motion block cut out, or an error message.
export function outsideMotionGate(css) {
  let text = stripComments(css);
  for (;;) {
    MOTION_GATE.lastIndex = 0;
    const m = MOTION_GATE.exec(text);
    if (!m) return { text };
    const open = m.index + m[0].length - 1;
    const end = blockEnd(text, open);
    if (end < 0) return { error: "a prefers-reduced-motion block does not close" };
    text = text.slice(0, m.index) + text.slice(end + 1);
  }
}

// Declarations of each custom property inside the rule whose selector matches `selector` exactly.
function ruleTokens(css, selectorPattern) {
  const out = {};
  const re = new RegExp(`(?:^|[}\\s])${selectorPattern}\\s*\\{([^{}]*)\\}`, "g");
  let m;
  while ((m = re.exec(css))) {
    for (const d of m[1].matchAll(/--([a-z-]+)\s*:\s*([^;]+);?/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

export function stylesheetProblems(css) {
  const problems = [];
  const plain = stripComments(css);
  const gated = outsideMotionGate(css);
  if (gated.error) problems.push(`${STYLESHEET}: ${gated.error}.`);
  else if (/(?:^|[;{\s])(animation|transition)(?:-[a-z-]+)?\s*:/.test(gated.text)) {
    problems.push(`${STYLESHEET}: every animation and transition belongs inside @media (prefers-reduced-motion: no-preference).`);
  }
  const dark = ruleTokens(plain, ":root");
  const light = ruleTokens(plain, ':root\\[data-theme="light"\\]');
  const auto = ruleTokens(plain, ':root:not\\(\\[data-theme="dark"\\]\\)');
  if (!/@media\s*\(\s*prefers-color-scheme\s*:\s*light\s*\)\s*\{\s*:root:not\(\[data-theme="dark"\]\)/.test(plain)) {
    problems.push(`${STYLESHEET}: the light palette must also follow the visitor's light preference (@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) … }).`);
  }
  for (const [mode, rule] of [["dark", dark], ["light", light], ["preferred light", auto]]) {
    const want = TOKENS[mode === "dark" ? "dark" : "light"];
    for (const [name, value] of Object.entries(want)) {
      if ((rule[name] ?? "").toUpperCase() !== value) {
        problems.push(`${STYLESHEET}: --${name} in the ${mode} palette is ${rule[name] ?? "missing"}; the house style says ${value}.`);
      }
    }
  }
  return problems;
}

export function pageProblems(path, html) {
  const problems = [];
  const head = html.split(/<\/head>/i)[0] ?? "";
  if (!head.includes(`<link rel="stylesheet" href="${STYLESHEET}">`)) problems.push(`${path}: must link ${STYLESHEET} in its head.`);
  if (!head.includes(`<script src="${SCRIPT}"></script>`)) problems.push(`${path}: must load ${SCRIPT} in its head (no defer, so a saved mode applies before the first paint).`);
  if (!/<body[^>]*>\s*<div class="lights" aria-hidden="true"><span class="l1"><\/span><span class="l2"><\/span><span class="l3"><\/span><\/div>/.test(html)) {
    problems.push(`${path}: the ambient lights (<div class="lights" aria-hidden="true"> with l1, l2, l3) must open the body.`);
  }
  const switches = html.match(/<button\b[^>]*\bid="theme-switch"[^>]*>/g) ?? [];
  if (switches.length !== 1) problems.push(`${path}: needs exactly one <button id="theme-switch">, found ${switches.length}.`);
  else if (!/type="button"/.test(switches[0]) || !/aria-label="[^"]+"/.test(switches[0]) || !/class="theme-switch"/.test(switches[0])) {
    problems.push(`${path}: the theme switch must be <button class="theme-switch" id="theme-switch" type="button" aria-label="…">.`);
  }
  return problems;
}
