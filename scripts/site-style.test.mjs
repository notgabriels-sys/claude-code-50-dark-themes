import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { CONTRAST_PAIRS, PALETTE, SITE_PAGES, STYLESHEET, colourLiterals, contrast, fontFaces, fontProblems, pageProblems, parseCss, stylesheetProblems, themesOf } from "./site-style.mjs";

const root = new URL("../", import.meta.url);
const projectRoot = fileURLToPath(root);
const css = await readFile(new URL(STYLESHEET, root), "utf8");
const page = await readFile(new URL("index.html", root), "utf8");
const fontFiles = fontFaces(css).flatMap(({ urls }) => urls);
const fontDirectory = async () =>
  Object.fromEntries(
    await Promise.all((await readdir(new URL("assets/fonts/", root))).map(async (name) => [name, name.endsWith(".txt") ? await readFile(new URL(`assets/fonts/${name}`, root), "utf8") : true])),
  );

// One change to a text that must contain `from` exactly once.
const swap = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `the text contains ${JSON.stringify(from)} exactly once`);
  return text.replace(from, to);
};
const bad = (problems, pattern, label) => {
  assert.ok(problems.some((problem) => pattern.test(problem)), `${label}: expected a problem matching ${pattern}, got ${JSON.stringify(problems)}`);
};

test("parseCss: rules with their at-rule context, through comments, strings and keyframes", () => {
  const rules = parseCss(`
    /* a { b } */
    :root { --a: #FFFFFF; content: "{ not a block }"; }
    @media (prefers-reduced-motion: no-preference) {
      .x:hover { transform: translateY(-2px) !important; }
      @keyframes drift { to { transform: rotate(1turn); } }
    }
    @font-face { font-family: "A B"; src: url("fonts/a;b.ttf") format("truetype"); }
  `);
  assert.deepEqual(
    rules.map(({ selector, context }) => [selector, context]),
    [
      [":root", []],
      [".x:hover", ["@media(prefers-reduced-motion:no-preference)"]],
      ["to", ["@media(prefers-reduced-motion:no-preference)", "@keyframesdrift"]],
      ["@font-face", []],
    ],
  );
  assert.deepEqual(rules[0].declarations, [
    { property: "--a", value: "#FFFFFF" },
    { property: "content", value: '"{ not a block }"' },
  ]);
  assert.equal(rules[1].declarations[0].value, "translateY(-2px)", "!important is not part of the value");
  assert.equal(rules[3].declarations[1].value, 'url("fonts/a;b.ttf") format("truetype")', "a semicolon inside a string does not end the declaration");
});

test("colourLiterals: hex and rgb() are read, every other way of naming a colour is reported", () => {
  const read = (value, property) => colourLiterals(value, property).map(({ rgb, alpha, problem }) => (problem ? "problem" : `${rgb.join(",")}/${alpha}`));
  assert.deepEqual(read("#FFF"), ["255,255,255/1"]);
  assert.deepEqual(read("#0F0F13"), ["15,15,19/1"]);
  assert.deepEqual(read("#0F0F1380"), [`15,15,19/${0x80 / 255}`]);
  assert.deepEqual(read("rgba(168, 152, 255, 0.16)"), ["168,152,255/0.16"]);
  assert.deepEqual(read("rgb(168 152 255 / 16%)"), ["168,152,255/0.16"]);
  assert.deepEqual(read("0 0 0 4px var(--accent-soft), 0 18px 40px -24px rgba(15, 15, 19, 0.6)", "box-shadow"), ["15,15,19/0.6"]);
  assert.deepEqual(read("#12345"), ["problem"], "five hex digits are no colour");
  assert.deepEqual(read("hsl(250 100% 80%)"), ["problem"]);
  assert.deepEqual(read("oklch(0.7 0.1 280)"), ["problem"]);
  assert.deepEqual(read("1px solid white", "border"), ["problem"]);
  assert.deepEqual(read("radial-gradient(circle, var(--accent-soft), transparent 70%)", "background"), [], "transparent is no colour of its own");
  assert.deepEqual(read("inset -5px -2px 0 0 currentColor", "box-shadow"), []);
  assert.deepEqual(read("color-mix(in srgb, var(--accent) 42%, var(--hair))", "--accent-dim"), [], "a mix of tokens names no colour itself");
  assert.deepEqual(read("tan 2s ease", "animation"), [], "a named colour is only read where a colour goes");
  assert.deepEqual(read('url("fonts/#FFF.ttf")', "src"), [], "a url is not read for colours");
});

test("contrast: WCAG 2.x's formula", () => {
  assert.equal(contrast([0, 0, 0], [255, 255, 255]).toFixed(2), "21.00");
  assert.equal(contrast([119, 119, 119], [255, 255, 255]).toFixed(2), "4.48");
  assert.equal(contrast([0, 0, 255], [255, 255, 255]).toFixed(2), "8.59");
});

test("the stylesheet on disk passes, both of its themes resolve, and every contrast pair is measured", () => {
  assert.deepEqual(stylesheetProblems(css), []);
  const { dark, light } = themesOf(parseCss(css));
  assert.equal(dark.get("--ground"), PALETTE.dark.bg);
  assert.equal(light.get("--ground"), PALETTE.light.bg);
  assert.equal(dark.get("--mute"), PALETTE.dark.muted);
  assert.equal(light.get("--accent"), PALETTE.light.accent);
  assert.ok(CONTRAST_PAIRS.length >= 20, "text tokens on every surface, chips, the primary pill and the two marks");
});

test("palette: a colour the design base does not name fails, however it is written", () => {
  bad(stylesheetProblems(swap(css, "--ink: #EDEBF3;         /* text */", "--ink: #EDEDED;         /* text */")), /--ink }: #EDEDED is #EDEDED, which is not in the house palette/, "a near-white of its own");
  bad(stylesheetProblems(swap(css, "rgba(168, 152, 255, 0.16);\n  --accent-dim", "rgba(160, 152, 255, 0.16);\n  --accent-dim")), /rgba\(160, 152, 255, 0\.16\) is #A098FF, which is not in the house palette/, "a soft colour off by one channel");
  bad(stylesheetProblems(swap(css, "rgba(15, 15, 19, 0.6)", "rgba(0, 0, 0, 0.6)")), /is #000000, which is not in the house palette/, "a black shadow");
  bad(stylesheetProblems(swap(css, "background: var(--accent);\n  color: var(--ground);", "background: hsl(250 100% 80%);\n  color: var(--ground);")), /hsl\(…\) is a colour function/, "a colour function");
  bad(stylesheetProblems(swap(css, ".theme-switch:hover { border-color: var(--accent); }", ".theme-switch:hover { border-color: white; }")), /white is a named colour/, "a named colour");
});

test("two themes: both light declarations say the same, cover every colour, and add nothing the dark theme lacks", () => {
  const [first, second] = css.split("  --raise: #F8F7FB;\n");
  assert.equal(css.split("  --raise: #F8F7FB;\n").length, 3, "the light theme is declared twice");
  bad(stylesheetProblems(`${first}  --raise: #FFFFFF;\n${second}  --raise: #F8F7FB;\n${css.split("  --raise: #F8F7FB;\n")[2]}`), /light theme: --raise is #FFFFFF for a light system and #F8F7FB for a visitor who chose light/, "the two declarations differ");
  bad(stylesheetProblems(css.replaceAll("    --raise: #F8F7FB;\n", "").replaceAll("  --raise: #F8F7FB;\n", "")), /light theme does not re-declare --raise \(#1C1C24 in the dark theme\), so it stays dark/, "a colour left dark");
  bad(stylesheetProblems(css.replaceAll("--halo: 0.32;", "--halo: 0.32;\n  --glow: #5A45D6;")), /light theme declares --glow, which the dark :root does not/, "a token only the light theme has");
  bad(stylesheetProblems(swap(css, ':root:not([data-theme="dark"]) {', ":root {")), /must declare the light theme for a light system exactly once/, "a light system's theme that the dark choice cannot override");
  const unwrapped = swap(css, '@media (prefers-color-scheme: light) {\n  :root:not([data-theme="dark"]) {', ':root:not([data-theme="dark"]) {').replace("    color-scheme: light;\n  }\n}\n", "    color-scheme: light;\n  }\n");
  bad(stylesheetProblems(unwrapped), /must declare the light theme for a light system exactly once, as :root:not\(\[data-theme="dark"\]\) directly inside @media \(prefers-color-scheme: light\)/, "the light theme for every visitor who has not chosen dark, whatever their system says");
  bad(stylesheetProblems(swap(css, ':root[data-theme="light"] {', '@media (min-width: 1px) { :root[data-theme="light"] {').replace("  color-scheme: light;\n}\n\n/* A terminal", "  color-scheme: light;\n}}\n\n/* A terminal")), /must declare the light theme for a visitor who chose it exactly once/, "the chosen light theme inside a media query");
  bad(stylesheetProblems(swap(css, ".cmd {\n  --ink: #EDEBF3;", ".cmd {\n  --ink: #16151C;")), /a specimen re-declares --ink as #16151C, but the dark theme's value is #EDEBF3/, "a specimen that turns light");
});

test("contrast: every pair holds its floor in each theme, and ember is never text", () => {
  const lightMute = (value) => css.replaceAll("--mute: #5C5A6A;", `--mute: ${value};`);
  bad(stylesheetProblems(lightMute("#9C99AA")), /light theme: --mute #9C99AA on --ground #F2F1F6 is 2\.\d\d:1, below the 4\.5:1 floor for text/, "the dark muted grey on the light page");
  // A grey that only just misses: 3.99:1 on the page and 4.49:1 on a white card.
  bad(stylesheetProblems(lightMute("#77767F")), /light theme: --mute #77767F on --ground #F2F1F6 is 3\.99:1, below the 4\.5:1 floor for text/, "a near miss on the page");
  bad(stylesheetProblems(lightMute("#77767F")), /light theme: --mute #77767F on --ground-2 #FFFFFF is 4\.49:1, below the 4\.5:1 floor for text/, "a near miss on a card");
  bad(stylesheetProblems(swap(css, "--accent: #A898FF;      /* violet", "--accent: #5A45D6;      /* violet").replace(/(\.specimen,\n\.cmd \{[\s\S]*?--accent: )#A898FF/, "$1#5A45D6")), /dark theme: --accent #5A45D6 on --raise #1C1C24 is \d\.\d\d:1, below the 4\.5:1 floor for text/, "the light violet on the dark page");
  bad(stylesheetProblems(`${css}\n.label { color: var(--ember); }\n`), /\.label \{ color: var\(--ember\) \}: ember is a point, never text/, "ember as text");
  assert.equal(contrast([0xb8, 0x60, 0x1a], [0xf2, 0xf1, 0xf6]) < 4.5, true, "which it would fail on the light page");
});

test("motion: every animation and hover transform waits for the visitor's permission, or the same selector turns it off", () => {
  const unguarded = swap(css, "  .lights .l1 { animation: drift-a 26s ease-in-out infinite alternate; }\n", "") + "\n.lights .l1 { animation: drift-a 26s ease-in-out infinite alternate; }\n";
  bad(stylesheetProblems(unguarded), /\.lights \.l1 \{ animation: drift-a 26s ease-in-out infinite alternate \} runs whatever the visitor's motion setting/, "a drift outside the block");
  assert.deepEqual(stylesheetProblems(`${unguarded}@media (prefers-reduced-motion: reduce) { .lights .l1 { animation: none; } }\n`), [], "turned off for the same selector when motion is reduced");
  bad(stylesheetProblems(`${unguarded}@media (prefers-reduced-motion: reduce) { .lights .l2 { animation: none; } }\n`), /\.lights \.l1 \{ animation/, "turned off for another selector");
  bad(stylesheetProblems(`${css}\n@media not (prefers-reduced-motion: no-preference) { .x { animation: drift-a 2s; } }\n`), /\.x \{ animation: drift-a 2s \} runs whatever/, "a block that means the opposite");
  bad(stylesheetProblems(`${css}\n.theme-switch:hover { transform: translateY(-2px); }\n`), /\.theme-switch:hover \{ transform: translateY\(-2px\) \} runs whatever the visitor's motion setting/, "a hover lift outside the block");
  assert.deepEqual(stylesheetProblems(`${css}\n.theme-switch:hover { transform: none; }\n.skip-link:focus { transform: translateY(0); }\n`), [], "no movement, or not a hover");
});

test("pages: the storefront on disk wears the base, and each part of it is required", () => {
  assert.deepEqual(SITE_PAGES, ["index.html"]);
  assert.deepEqual(pageProblems(page, "index.html", fontFiles), []);
  const check = (html) => pageProblems(html, "index.html", fontFiles);
  bad(check(swap(page, '<link rel="stylesheet" href="assets/site.css">\n', "")), /index\.html does not link assets\/site\.css/, "no stylesheet");
  bad(check(swap(page, '<link rel="stylesheet" href="assets/site.css">\n<style>', '<style></style>\n<link rel="stylesheet" href="assets/site.css">\n<style>')), /links assets\/site\.css after its own <style>/, "the stylesheet after the page's style");
  bad(check(swap(page, '<span class="l3"></span>', "")), /does not carry the ambient lights/, "a light missing");
  bad(check(swap(page, '<div class="lights" aria-hidden="true">', '<div class="lights">')), /does not carry the ambient lights/, "lights a screen reader would visit");
  bad(check(swap(page, 'id="themeSwitch" type="button" hidden>', 'id="themeSwitch" type="button">')), /does not carry the theme switch/, "a switch shown before its script can work it");
  bad(check(swap(page, 'const THEME_KEY = "familiars-theme";', 'const THEME_KEY = "storefront-theme";')), /does not work the theme switch under the key "familiars-theme"/, "a key of its own");
  bad(check(swap(page, '<link rel="stylesheet" href="assets/site.css">', '<link rel="stylesheet" href="assets/site.css">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk">')), /fetches a font from Google/, "a third-party font");
  bad(check(swap(page, 'href="assets/fonts/FamiljenGrotesk-VF.ttf"', 'href="assets/fonts/Other.ttf"')), /preloads the font assets\/fonts\/Other\.ttf, which no @font-face/, "a preload for nothing");
  bad(check(swap(page, 'type="font/ttf" crossorigin>', 'type="font/ttf">')), /without crossorigin/, "a preload fetched twice");
  bad(check(swap(page, "  @media (prefers-reduced-motion:no-preference){\n    .theme-monolith{animation:monolith-float 5s ease-in-out infinite}", "  .theme-monolith{animation:monolith-float 5s ease-in-out infinite}\n  @media (prefers-reduced-motion:no-preference){")), /index\.html \.theme-monolith \{ animation: monolith-float 5s ease-in-out infinite \} runs whatever/, "the page's own animation outside the block");
  bad(check(swap(page, "  .syntax-version{color:var(--accent)}", "  .syntax-version{color:var(--ember)}")), /index\.html \.syntax-version \{ color: var\(--ember\) \}: ember is a point, never text/, "ember as the page's text");
  // A one-off pulse the reduce block turns off for the same selector, as a deep-linked card has.
  const pulse = swap(page, "  @media (prefers-reduced-motion:reduce){\n", "  .card.deep-linked{animation:deep-link-pulse 2.4s ease-out}\n  @media (prefers-reduced-motion:reduce){\n    .card.deep-linked{animation:none}\n");
  assert.deepEqual(check(pulse), []);
});

test("fonts: each face loads a file that is there, each file is used, and each family carries the OFL", async () => {
  const files = await fontDirectory();
  assert.deepEqual(fontProblems(css, files), []);
  assert.deepEqual(fontFiles, ["assets/fonts/FamiljenGrotesk-VF.ttf", "assets/fonts/IBMPlexMono-Regular.ttf", "assets/fonts/IBMPlexMono-Medium.ttf"]);
  const without = (name) => Object.fromEntries(Object.entries(files).filter(([key]) => key !== name));
  bad(fontProblems(css, without("OFL-IBMPlexMono.txt")), /assets\/fonts\/OFL-IBMPlexMono\.txt is missing or is not the SIL Open Font License; "IBM Plex Mono"/, "a licence missing");
  bad(fontProblems(css, { ...files, "OFL-FamiljenGrotesk.txt": "All rights reserved." }), /OFL-FamiljenGrotesk\.txt is missing or is not the SIL Open Font License/, "a licence that is not the OFL");
  bad(fontProblems(css, without("IBMPlexMono-Medium.ttf")), /loads assets\/fonts\/IBMPlexMono-Medium\.ttf, which is not a file in assets\/fonts/, "a face whose file is gone");
  bad(fontProblems(css, { ...files, "Spare.woff2": true }), /assets\/fonts\/Spare\.woff2 is not loaded by any @font-face/, "a font file nothing uses");
  bad(fontProblems(css.replace('url("fonts/IBMPlexMono-Medium.ttf")', 'url("https://example.com/IBMPlexMono-Medium.ttf")'), files), /loads example\.com\/IBMPlexMono-Medium\.ttf|loads IBMPlexMono-Medium\.ttf, which is not a file in assets\/fonts/, "a face served from elsewhere");
});

// --- the verifier on the real files -----------------------------------------------------------

async function makeFixture(t) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gabs-site-style-"));
  const fixtureRoot = join(temporaryRoot, "repo");
  await cp(projectRoot, fixtureRoot, {
    recursive: true,
    filter(source) {
      const pathFromRoot = relative(projectRoot, source);
      return ![".git", ".worktrees", "node_modules"].some((directory) => pathFromRoot === directory || pathFromRoot.startsWith(`${directory}${sep}`));
    },
  });
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  return fixtureRoot;
}
function runVerifier(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/verify.mjs"], { cwd });
    let stderr = "";
    child.stdout.resume();
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}
async function editOnce(fixtureRoot, path, from, to) {
  const file = join(fixtureRoot, path);
  await writeFile(file, swap(await readFile(file, "utf8"), from, to));
}
async function expectRed(fixtureRoot, pattern) {
  const result = await runVerifier(fixtureRoot);
  assert.notEqual(result.code, 0, "the verifier fails");
  assert.match(result.stderr, pattern);
}
async function expectGreen(fixtureRoot) {
  const result = await runVerifier(fixtureRoot);
  assert.equal(result.code, 0, `the verifier passes:\n${result.stderr}`);
}

test("the verifier fails a colour off the palette, a light theme that splits, a page off the base, motion against the setting and a font without its licence, and passes the site as it is", async (t) => {
  const fixtureRoot = await makeFixture(t);
  await expectGreen(fixtureRoot);
  await editOnce(fixtureRoot, STYLESHEET, "--ember: #FFB46B;", "--ember: #FFA500;");
  await expectRed(fixtureRoot, /assets\/site\.css :root \{ --ember \}: #FFA500 is #FFA500, which is not in the house palette/);
  await editOnce(fixtureRoot, STYLESHEET, "--ember: #FFA500;", "--ember: #FFB46B;");
  await editOnce(fixtureRoot, STYLESHEET, ':root[data-theme="light"] {\n  --ground: #F2F1F6;', ':root[data-theme="light"] {\n  --ground: #FFFFFF;');
  await expectRed(fixtureRoot, /light theme: --ground is #F2F1F6 for a light system and #FFFFFF for a visitor who chose light/);
  await editOnce(fixtureRoot, STYLESHEET, ':root[data-theme="light"] {\n  --ground: #FFFFFF;', ':root[data-theme="light"] {\n  --ground: #F2F1F6;');
  await editOnce(fixtureRoot, "index.html", '<link rel="stylesheet" href="assets/site.css">\n', "");
  await expectRed(fixtureRoot, /index\.html does not link assets\/site\.css/);
  await editOnce(fixtureRoot, "index.html", '<link rel="preload"', '<link rel="stylesheet" href="assets/site.css">\n<link rel="preload"');
  await expectGreen(fixtureRoot);
  await editOnce(fixtureRoot, "index.html", "  @media (prefers-reduced-motion:no-preference){\n    .theme-monolith", "  .theme-monolith{animation:monolith-float 5s ease-in-out infinite}\n  @media (prefers-reduced-motion:no-preference){\n    .theme-monolith");
  await expectRed(fixtureRoot, /index\.html \.theme-monolith \{ animation: monolith-float 5s ease-in-out infinite \} runs whatever the visitor's motion setting/);
  await editOnce(fixtureRoot, "index.html", "  .theme-monolith{animation:monolith-float 5s ease-in-out infinite}\n  @media (prefers-reduced-motion:no-preference){\n    .theme-monolith", "  @media (prefers-reduced-motion:no-preference){\n    .theme-monolith");
  await rm(join(fixtureRoot, "assets/fonts/OFL-FamiljenGrotesk.txt"));
  await expectRed(fixtureRoot, /assets\/fonts\/OFL-FamiljenGrotesk\.txt is missing or is not the SIL Open Font License/);
  await cp(join(projectRoot, "assets/fonts/OFL-FamiljenGrotesk.txt"), join(fixtureRoot, "assets/fonts/OFL-FamiljenGrotesk.txt"));
  await expectGreen(fixtureRoot);
});
