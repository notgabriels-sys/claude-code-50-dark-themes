import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { CONTRAST_PAIRS, PALETTE, SITE_PAGES, STYLESHEET, colourLiterals, contrast, fontFaces, fontProblems, motionProblems, pageFontFiles, pageProblems, parseCss, sharedTokens, stylesheetProblems, themesOf } from "./site-style.mjs";

const root = new URL("../", import.meta.url);
const projectRoot = fileURLToPath(root);
const css = await readFile(new URL(STYLESHEET, root), "utf8");
const page = await readFile(new URL("index.html", root), "utf8");
const fontFiles = fontFaces(css).flatMap(({ urls }) => urls);
const tokens = sharedTokens(css);
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
    { property: "--a", value: "#FFFFFF", important: false },
    { property: "content", value: '"{ not a block }"', important: false },
  ]);
  assert.equal(rules[1].declarations[0].value, "translateY(-2px)", "!important is not part of the value");
  assert.equal(rules[1].declarations[0].important, true, "but it is kept");
  assert.equal(rules[3].declarations[1].value, 'url("fonts/a;b.ttf") format("truetype")', "a semicolon inside a string does not end the declaration");
  // A "/*" inside a string starts no comment, so the rule after it is still read.
  assert.deepEqual(parseCss('.q::before { content: "/*"; } .y { color: #FF0000; } .q::after { content: "*/"; }').map(({ selector }) => selector), [".q::before", ".y", ".q::after"]);
  // A style rule nested in another is marked, so the rules can refuse it rather than skip its declarations.
  assert.deepEqual(parseCss(".x { color: #FF0000; &:focus { outline: 0; } }").map(({ selector, nested }) => [selector, Boolean(nested)]), [[".x", true], ["&:focus", false]]);
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
  assert.deepEqual(read('url("a(1).png"), #FF0000, url("b(2).png")', "background"), ["255,0,0/1"], "a bracket inside a quoted url does not hide what follows");
  assert.deepEqual(read("var(--nope, red)"), ["problem"], "a var() fallback still paints");
  assert.deepEqual(read("white", "-webkit-text-fill-color"), ["problem"]);
  assert.deepEqual(read("0 0 6px gold", "filter"), ["problem"]);
  assert.deepEqual(read("CanvasText"), ["problem"], "a system colour");
  assert.deepEqual(read("color-mix(in srgb, #A898FF 50%, #FFB46B)").filter((entry) => entry === "problem").length, 1, "a mix of literals paints a colour of its own");
  assert.deepEqual(read(`url("data:image/svg+xml,<svg fill='red'/>")`, "background"), ["problem"], "an inline image");
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
  const softAnchor = "rgba(168, 152, 255, 0.16);\n  --accent-dim: color-mix(in srgb, var(--accent) 42%, var(--hair));\n  --ember: #FFB46B;       /* the one warm point */";
  bad(stylesheetProblems(swap(css, softAnchor, softAnchor.replace("168, 152", "160, 152"))), /rgba\(160, 152, 255, 0\.16\) is #A098FF, which is not in the house palette/, "a soft colour off by one channel");
  bad(stylesheetProblems(swap(css, "rgba(15, 15, 19, 0.25)", "rgba(0, 0, 0, 0.25)")), /is #000000, which is not in the house palette/, "a black shadow");
  bad(stylesheetProblems(swap(css, "background: var(--accent);\n  color: var(--ground);", "background: hsl(250 100% 80%);\n  color: var(--ground);")), /hsl\(…\) is a colour function/, "a colour function");
  bad(stylesheetProblems(swap(css, ".lit:hover { border-color: var(--accent); }", ".lit:hover { border-color: white; }")), /white is a named colour/, "a named colour");
  bad(stylesheetProblems(swap(css, ".lit:hover { border-color: var(--accent); }", ".lit:hover { border-color: color-mix(in srgb, #A898FF 50%, #FFB46B); }")), /mixes a literal colour/, "a mix of two palette colours, which is neither");
  bad(stylesheetProblems(swap(css, ".lit:hover { border-color: var(--accent); }", ".lit:hover { border-color: var(--edge, gold); }")), /gold is a named colour/, "a named fallback");
  bad(stylesheetProblems(`@import url("https://fonts.googleapis.com/css2?family=Familjen+Grotesk");\n${css}`), /uses @import/, "a stylesheet that fetches another");
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
  const specimen = ".cmd {\n  --ground: #0F0F13;\n  --ground-2: #16161C;\n  --raise: #1C1C24;\n  --ink: #EDEBF3;";
  bad(stylesheetProblems(swap(css, specimen, specimen.replace("--ink: #EDEBF3", "--ink: #16151C"))), /a specimen re-declares --ink as #16151C, but the dark theme's value is #EDEBF3/, "a specimen that turns light");
  bad(stylesheetProblems(swap(css, "  --accent-dim: color-mix(in srgb, var(--accent) 42%, var(--hair));\n  --ember: #FFB46B;\n  --ember-soft: rgba(255, 180, 107, 0.28);\n  color-scheme: dark;", "  --ember: #FFB46B;\n  --ember-soft: rgba(255, 180, 107, 0.28);\n  color-scheme: dark;")), /\.specimen, \.cmd does not re-declare --accent-dim \(color-mix\(in srgb, var\(--accent\) 42%, var\(--hair\)\)\)/, "a mix the specimen leaves to the light theme");
  bad(stylesheetProblems(swap(css, "--ink: #EDEBF3;         /* text */", "--ink: #EDEBF3 !important; /* text */")), /:root \{ --ink \} is !important, which outranks both light declarations/, "a dark token that beats the light theme");
  bad(stylesheetProblems(`${css}\n.x { color: var(--ink); &:focus { outline: 0; } }\n`), /\.x nests rules inside a style rule/, "nesting, which the rules do not read");
  // A token that follows another is no light-theme omission, and its contrast is read through it.
  const following = css.replace("--faint: #9C99AA;       /* small print: as readable as secondary text */", "--faint: var(--mute);   /* small print */").replace("  --faint: #9C99AA;\n  --hair", "  --faint: var(--mute);\n  --hair").replaceAll("--faint: #5C5A6A;\n", "");
  assert.deepEqual(stylesheetProblems(following), []);
});

test("contrast: every pair holds its floor in each theme, and ember is never text", () => {
  const lightMute = (value) => css.replaceAll("--mute: #5C5A6A;", `--mute: ${value};`);
  bad(stylesheetProblems(lightMute("#9C99AA")), /light theme: --mute #9C99AA on --ground #F2F1F6 is 2\.\d\d:1, below the 4\.5:1 floor for text/, "the dark muted grey on the light page");
  // A grey that only just misses: 3.99:1 on the page and 4.49:1 on a white card.
  bad(stylesheetProblems(lightMute("#77767F")), /light theme: --mute #77767F on --ground #F2F1F6 is 3\.99:1, below the 4\.5:1 floor for text/, "a near miss on the page");
  bad(stylesheetProblems(lightMute("#77767F")), /light theme: --mute #77767F on --ground-2 #FFFFFF is 4\.49:1, below the 4\.5:1 floor for text/, "a near miss on a card");
  bad(stylesheetProblems(swap(css, "--accent: #A898FF;      /* violet", "--accent: #5A45D6;      /* violet").replace(/(\.specimen,\n\.cmd \{[\s\S]*?--accent: )#A898FF/, "$1#5A45D6")), /dark theme: --accent #5A45D6 on --raise #1C1C24 is \d\.\d\d:1, below the 4\.5:1 floor for text/, "the light violet on the dark page");
  bad(stylesheetProblems(`${css}\n.label { color: var(--ember); }\n`), /\.label \{ color: var\(--ember\) \}: ember is a point, never text/, "ember as text");
  bad(stylesheetProblems(`${css}\n.fine { color: var(--hair); }\n`), /\.fine \{ color: var\(--hair\) \}: text takes --ink, --mute, --faint or --accent/, "a caption in the line colour");
  bad(stylesheetProblems(`${css}\n.fine { color: rgba(237, 235, 243, 0.3); }\n`), /\.fine \{ color: rgba\(237, 235, 243, 0\.3\) \}: text takes/, "ink at a third");
  bad(stylesheetProblems(`${css}\n.card { color: #EDEBF3; }\n`), /\.card \{ color: #EDEBF3 \}: text takes/, "a literal that the light theme never re-declares");
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
  // The reduce rule must come later, at the top of its block: an earlier one is overridden.
  bad(stylesheetProblems(`${css}\n@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }\n.spin { animation: drift-a 2s linear infinite; }\n`), /\.spin \{ animation: drift-a 2s linear infinite \} runs whatever/, "an animation after the rule that turns it off");
  bad(stylesheetProblems(`${css}\n.spin { animation: drift-a 2s linear infinite; }\n@media (min-width: 900px) { @media (prefers-reduced-motion: reduce) { .spin { animation: none; } } }\n`), /\.spin \{ animation/, "an off rule that holds on wide screens only");
  bad(stylesheetProblems(`${css}\n.spin { -webkit-animation: drift-a 2s linear infinite; }\n`), /\.spin \{ -webkit-animation: drift-a 2s linear infinite \} runs whatever/, "a prefixed animation");
  bad(stylesheetProblems(`${css}\n.rise { transform: translateY(12px); transition: transform .6s; }\n.rise.in { transform: none; }\n`), /\.rise \{ transition: transform \.6s \} runs whatever/, "a reveal by transition");
  bad(stylesheetProblems(`${css}\n.b { transition: .3s; }\n`), /\.b \{ transition: \.3s \} runs whatever/, "a transition of every property");
  assert.deepEqual(motionProblems(parseCss(".b { transition: color .3s ease, border-color .2s; }"), "x"), [], "colours fade, nothing moves");
  bad(stylesheetProblems(`${css}\nhtml { scroll-behavior: smooth; }\n`), /html \{ scroll-behavior: smooth \} runs whatever/, "smooth scrolling");
  assert.deepEqual(stylesheetProblems(`${css}\nhtml { scroll-behavior: smooth; }\n@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }\n`), [], "smooth scrolling turned off when motion is reduced");
  bad(stylesheetProblems(`${css}\n@view-transition { navigation: auto; }\n`), /@view-transition \{ navigation: auto \} runs whatever/, "a view transition");
  assert.deepEqual(stylesheetProblems(`${css}\n@media (prefers-reduced-motion: no-preference) and (min-width: 600px) { .x { animation: drift-a 2s; } }\n@media screen and (prefers-reduced-motion: no-preference) { .y { animation: drift-a 2s; } }\n`), [], "the permission joined to other conditions by and");
  bad(stylesheetProblems(`${css}\n@media (prefers-reduced-motion: no-preference), (min-width: 600px) { .x { animation: drift-a 2s; } }\n`), /\.x \{ animation: drift-a 2s \} runs whatever/, "the permission as one of a list");
  // Each of these holds the permission as one "and" term, yet the query matches without it.
  bad(stylesheetProblems(`${css}\n@media (min-width: 600px), (orientation: portrait) and (prefers-reduced-motion: no-preference) { .x { animation: drift-a 2s; } }\n`), /\.x \{ animation: drift-a 2s \} runs whatever/, "the permission in the second query of a list");
  bad(stylesheetProblems(`${css}\n@media ((min-width: 600px) or ((hover: hover) and (prefers-reduced-motion: no-preference) and (pointer: fine))) { .x { animation: drift-a 2s; } }\n`), /\.x \{ animation: drift-a 2s \} runs whatever/, "the permission on one side of an or");
  bad(stylesheetProblems(`${css}\n@media not screen and (prefers-reduced-motion: no-preference) { .x { animation: drift-a 2s; } }\n`), /\.x \{ animation: drift-a 2s \} runs whatever/, "a query that not turns around");
  bad(stylesheetProblems(`${css}\n@media (prefers-reduced-motion: reduce) { .x { animation: drift-a 2s; } }\n`), /\.x \{ animation: drift-a 2s \} runs whatever/, "an animation for the visitors who asked for less motion");
  bad(stylesheetProblems(css.replace(':root[data-motion="paused"] *::after { animation-play-state: paused !important; }', "")), /must pause every animation while the page's motion switch is off/, "no pause");
});

test("pages: the storefront on disk wears the base, and each part of it is required", () => {
  assert.deepEqual(SITE_PAGES, ["index.html"]);
  assert.deepEqual(pageProblems(page, "index.html", fontFiles, tokens), []);
  const check = (html) => pageProblems(html, "index.html", fontFiles, tokens);
  bad(check(swap(page, '<link rel="stylesheet" href="assets/site.css">\n', "")), /index\.html does not link assets\/site\.css/, "no stylesheet");
  bad(check(swap(page, '<link rel="stylesheet" href="assets/site.css">\n<style>', '<style></style>\n<link rel="stylesheet" href="assets/site.css">\n<style>')), /links assets\/site\.css after its own <style>/, "the stylesheet after the page's style");
  bad(check(swap(page, '<span class="l3"></span>', "")), /does not carry the ambient lights/, "a light missing");
  bad(check(swap(page, '<div class="lights" aria-hidden="true">', '<div class="lights">')), /does not carry the ambient lights/, "lights a screen reader would visit");
  bad(check(swap(page, 'id="themeSwitch" type="button" hidden>', 'id="themeSwitch" type="button">')), /does not carry the theme switch/, "a switch shown before its script can work it");
  bad(check(swap(page, 'const THEME_KEY = "familiars-theme";', 'const THEME_KEY = "storefront-theme";')), /does not work the theme switch under the key "familiars-theme"/, "a key of its own");
  bad(check(swap(page, 'const THEME_KEY = "familiars-theme";', 'const THEME_KEY = "storefront-theme"; // was "familiars-theme"')), /does not work the theme switch/, "the key only in a comment");
  bad(check(swap(page, "localStorage.setItem(THEME_KEY, next)", 'localStorage.setItem("storefront-theme", next)')), /does not work the theme switch/, "a choice saved under another key");
  bad(check(swap(page, "localStorage.setItem(THEME_KEY, next);", 'localStorage.setItem("storefront-theme", next); // localStorage.setItem("familiars-theme", next);')), /does not work the theme switch/, "the shared key's save only in a trailing comment");
  bad(check(swap(page, "  themeSwitch.hidden = false;\n", "")), /does not work the theme switch/, "a switch that never shows");
  bad(check(swap(page, '<button class="motion-switch" id="motionSwitch" type="button" hidden>', '<button class="motion-switch" id="motionSwitch" type="button">')), /does not carry the motion switch/, "a motion switch shown before its script");
  bad(check(swap(page, 'const MOTION_KEY = "familiars-motion";', 'const MOTION_KEY = "storefront-motion";')), /does not work the motion switch under the key "familiars-motion"/, "a motion key of its own");
  bad(check(swap(page, '<link rel="stylesheet" href="assets/site.css">\n', '<!-- <link rel="stylesheet" href="assets/site.css"> -->\n')), /index\.html does not link assets\/site\.css/, "a stylesheet in a comment");
  bad(check(swap(page, '<link rel="stylesheet" href="assets/site.css">', '<link rel="stylesheet" href="assets/site.css" media="print">')), /links assets\/site\.css with media="print"/, "a stylesheet for print only");
  assert.deepEqual(check(swap(page, '<div class="lights" aria-hidden="true">', '<div class="lights ambient" aria-hidden="true">')), [], "the lights with a class of their own as well");
  bad(check(swap(page, '<link rel="stylesheet" href="assets/site.css">', '<link rel="stylesheet" href="assets/site.css">\n<link rel="stylesheet" href="https://fonts.bunny.net/css?family=familjen-grotesk:400,700">')), /links https:\/\/fonts\.bunny\.net\/css\?family=familjen-grotesk:400,700 \(stylesheet\) from another host/, "a font host other than Google");
  bad(check(swap(page, "  *{box-sizing:border-box}", '  @font-face{font-family:"Inter";src:url(https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-400-normal.woff2)}\n  *{box-sizing:border-box}')), /@font-face for "Inter" loads https:\/\/cdn\.jsdelivr\.net\/.* from another host/, "a page font from a CDN");
  bad(check(swap(page, "  *{box-sizing:border-box}", '  @import url("theme.css");\n  *{box-sizing:border-box}')), /index\.html's <style> uses @import/, "an import in the page");
  bad(check(swap(page, "    --radius:10px;\n", "    --radius:10px;\n    --mute:#2A2933;\n")), /index\.html :root re-declares --mute, a token of assets\/site\.css/, "a page that repaints a token");
  bad(check(swap(page, "  .finder-empty{margin:0;padding:18px 0 26px;color:var(--mute);", "  .finder-empty{margin:0;padding:18px 0 26px;color:var(--hair);")), /\.finder-empty \{ color: var\(--hair\) \}: --hair is a surface, line or wash, never text/, "the page's text in the line colour");
  bad(check(swap(page, "  .finder-empty{margin:0;padding:18px 0 26px;color:var(--mute);", "  .finder-empty{margin:0;padding:18px 0 26px;color:#c7b8ff;")), /\.finder-empty \{ color: #c7b8ff \}: a literal colour or the coding palette is text only inside a specimen/, "a literal on the page");
  bad(check(swap(page, "  .finder-empty{margin:0;padding:18px 0 26px;color:var(--mute);", "  .finder-empty{margin:0;padding:18px 0 26px;color:var(--syntax-light-purple);")), /a literal colour or the coding palette is text only inside a specimen/, "the coding palette on the light page");
  bad(check(swap(page, "    .skip-link{transition:transform .15s ease}\n", "") .replace("  .skip-link:focus{", "  .skip-link{transition:transform .15s ease}\n  .skip-link:focus{")), /\.skip-link \{ transition: transform \.15s ease \} runs whatever/, "a slide outside the block");
  bad(check(swap(page, '<link rel="stylesheet" href="assets/site.css">', '<link rel="stylesheet" href="assets/site.css">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk">')), /fetches a font from Google/, "a third-party font");
  bad(check(swap(page, 'href="assets/fonts/FamiljenGrotesk-VF.woff2"', 'href="assets/fonts/Other.woff2"')), /preloads the font assets\/fonts\/Other\.woff2, which no @font-face/, "a preload for nothing");
  bad(check(swap(page, 'type="font/woff2" crossorigin>', 'type="font/woff2">')), /without crossorigin/, "a preload fetched twice");
  bad(check(swap(page, "    .theme-monolith{animation:monolith-float 5s ease-in-out infinite}\n", "").replace("  @media (prefers-reduced-motion:no-preference){\n    .skip-link", "  .theme-monolith{animation:monolith-float 5s ease-in-out infinite}\n  @media (prefers-reduced-motion:no-preference){\n    .skip-link")), /index\.html \.theme-monolith \{ animation: monolith-float 5s ease-in-out infinite \} runs whatever/, "the page's own animation outside the block");
  bad(check(swap(page, "  .syntax-version{color:var(--accent)}", "  .syntax-version{color:var(--ember)}")), /index\.html \.syntax-version \{ color: var\(--ember\) \}: ember is a point, never text/, "ember as the page's text");
  // A one-off pulse the reduce block turns off for the same selector, as a deep-linked card has.
  const pulse = swap(page, "  @media (prefers-reduced-motion:reduce){\n", "  .card.deep-linked{animation:deep-link-pulse 2.4s ease-out}\n  @media (prefers-reduced-motion:reduce){\n    .card.deep-linked{animation:none}\n");
  assert.deepEqual(check(pulse), []);
  // The same pulse written after the reduce block outranks it, and runs.
  const late = swap(page, "  @media (prefers-reduced-motion:reduce){\n", "  @media (prefers-reduced-motion:reduce){\n    .card.deep-linked{animation:none}\n").replace("\n</style>\n</head>", "\n  .card.deep-linked{animation:deep-link-pulse 2.4s ease-out infinite}\n</style>\n</head>");
  bad(check(late), /\.card\.deep-linked \{ animation: deep-link-pulse 2\.4s ease-out infinite \} runs whatever/, "a pulse after the rule that turns it off");
});

test("fonts: each face loads a file that is there, each file is used, and each family carries the OFL", async () => {
  const files = await fontDirectory();
  assert.deepEqual(fontProblems(css, files), []);
  const plex = ["Regular", "Medium"].flatMap((weight) => ["Latin1", "Latin2", "Latin3", "Pi"].map((script) => `assets/fonts/IBMPlexMono-${weight}-${script}.woff2`));
  assert.deepEqual(fontFiles, ["assets/fonts/FamiljenGrotesk-VF.woff2", ...plex]);
  const without = (name) => Object.fromEntries(Object.entries(files).filter(([key]) => key !== name));
  bad(fontProblems(css, without("OFL-IBMPlexMono.txt")), /assets\/fonts\/OFL-IBMPlexMono\.txt is missing or is not the SIL Open Font License; "IBM Plex Mono"/, "a licence missing");
  bad(fontProblems(css, { ...files, "OFL-FamiljenGrotesk.txt": "All rights reserved." }), /OFL-FamiljenGrotesk\.txt is missing or is not the SIL Open Font License/, "a licence that is not the OFL");
  bad(fontProblems(css, without("IBMPlexMono-Medium-Latin1.woff2")), /loads assets\/fonts\/IBMPlexMono-Medium-Latin1\.woff2, which is not a file in assets\/fonts/, "a face whose file is gone");
  bad(fontProblems(css, { ...files, "Spare.woff2": true }), /assets\/fonts\/Spare\.woff2 is not loaded by any @font-face/, "a font file nothing uses");
  // A page not yet on the base may load its own font files; those count as used, and only those.
  const ownFaces = '<style>@font-face{font-family:"Own";src:url(assets/fonts/Spare.woff2) format("woff2")}</style>';
  assert.deepEqual(pageFontFiles(ownFaces, "familiars.html"), ["assets/fonts/Spare.woff2"]);
  assert.deepEqual(pageFontFiles(ownFaces.replace("url(assets/", "url(../assets/"), "guide/index.html"), ["assets/fonts/Spare.woff2"], "a page's url resolves against the page");
  assert.deepEqual(fontProblems(css, { ...files, "Spare.woff2": true }, pageFontFiles(ownFaces, "familiars.html")), []);
  bad(fontProblems(css, { ...files, "Spare.woff2": true }, pageFontFiles(ownFaces, "guide/index.html")), /assets\/fonts\/Spare\.woff2 is not loaded by any @font-face/, "a page url that resolves somewhere else");
  bad(fontProblems(css.replace('url("fonts/IBMPlexMono-Medium-Latin1.woff2")', 'url("https://example.com/IBMPlexMono-Medium-Latin1.woff2")'), files), /loads https:\/\/example\.com\/IBMPlexMono-Medium-Latin1\.woff2 from another host/, "a face served from elsewhere");
  bad(fontProblems(css.replace('url("fonts/IBMPlexMono-Medium-Latin1.woff2")', 'url("https://cdn.example.net/assets/fonts/IBMPlexMono-Medium-Latin1.woff2")'), files), /loads https:\/\/cdn\.example\.net\/assets\/fonts\/IBMPlexMono-Medium-Latin1\.woff2 from another host/, "a face from another host under the same path");
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
  await editOnce(fixtureRoot, STYLESHEET, "--ember: #FFB46B;       /* the one", "--ember: #FFA500;       /* the one");
  await expectRed(fixtureRoot, /assets\/site\.css :root \{ --ember \}: #FFA500 is #FFA500, which is not in the house palette/);
  await editOnce(fixtureRoot, STYLESHEET, "--ember: #FFA500;       /* the one", "--ember: #FFB46B;       /* the one");
  await editOnce(fixtureRoot, STYLESHEET, ':root[data-theme="light"] {\n  --ground: #F2F1F6;', ':root[data-theme="light"] {\n  --ground: #FFFFFF;');
  await expectRed(fixtureRoot, /light theme: --ground is #F2F1F6 for a light system and #FFFFFF for a visitor who chose light/);
  await editOnce(fixtureRoot, STYLESHEET, ':root[data-theme="light"] {\n  --ground: #FFFFFF;', ':root[data-theme="light"] {\n  --ground: #F2F1F6;');
  await editOnce(fixtureRoot, "index.html", '<link rel="stylesheet" href="assets/site.css">\n', "");
  await expectRed(fixtureRoot, /index\.html does not link assets\/site\.css/);
  await editOnce(fixtureRoot, "index.html", '<link rel="preload"', '<link rel="stylesheet" href="assets/site.css">\n<link rel="preload"');
  await expectGreen(fixtureRoot);
  await editOnce(fixtureRoot, "index.html", "  @media (prefers-reduced-motion:no-preference){\n    .skip-link", "  .theme-monolith{animation:monolith-float 5s ease-in-out infinite}\n  @media (prefers-reduced-motion:no-preference){\n    .skip-link");
  await expectRed(fixtureRoot, /index\.html \.theme-monolith \{ animation: monolith-float 5s ease-in-out infinite \} runs whatever the visitor's motion setting/);
  await editOnce(fixtureRoot, "index.html", "  .theme-monolith{animation:monolith-float 5s ease-in-out infinite}\n  @media (prefers-reduced-motion:no-preference){\n    .skip-link", "  @media (prefers-reduced-motion:no-preference){\n    .skip-link");
  await editOnce(fixtureRoot, "index.html", "    --radius:10px;\n", "    --radius:10px;\n    --mute:#2A2933;\n");
  await expectRed(fixtureRoot, /index\.html :root re-declares --mute, a token of assets\/site\.css/);
  await editOnce(fixtureRoot, "index.html", "    --radius:10px;\n    --mute:#2A2933;\n", "    --radius:10px;\n");
  await rm(join(fixtureRoot, "assets/fonts/OFL-FamiljenGrotesk.txt"));
  await expectRed(fixtureRoot, /assets\/fonts\/OFL-FamiljenGrotesk\.txt is missing or is not the SIL Open Font License/);
  await cp(join(projectRoot, "assets/fonts/OFL-FamiljenGrotesk.txt"), join(fixtureRoot, "assets/fonts/OFL-FamiljenGrotesk.txt"));
  await expectGreen(fixtureRoot);
});
