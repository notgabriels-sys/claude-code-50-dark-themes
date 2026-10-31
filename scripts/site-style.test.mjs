import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { CONTRAST_PAIRS, PALETTE, SITE_PAGES, STYLESHEET, THEME_PREVIEWS, colourLiterals, contrast, fontFaces, fontProblems, motionProblems, pageFontFiles, pageProblems, parseCss, sharedTokens, stylesheetProblems, themesOf } from "./site-style.mjs";

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
// The page with CSS added at the end of its <style>, where it outranks what comes before.
const withStyle = (html, rules) => swap(html, "\n</style>\n", `\n${rules}\n</style>\n`);
const PAUSE_GATE = ':root:not([data-motion="paused"])';
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
  assert.deepEqual(read(`image-set("data:image/svg+xml,%3Csvg fill='red'%3E" 1x)`, "background-image"), ["problem"], "an inline image in image-set()");
  assert.deepEqual(read("0 0 6px gold", "-webkit-box-shadow"), ["problem"], "a named colour behind a vendor prefix");
  assert.deepEqual(read("drop-shadow(0 0 4px red)", "backdrop-filter"), ["problem"], "a named colour in a backdrop filter");
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
  // Its fonts are the stylesheet's only requests, so the verifier can serve it.
  bad(stylesheetProblems(`${css}\n.lights .l1 { background-image: url("https://example.com/glow.png"); }\n`), /\.lights \.l1 \{ background-image \} fetches with url\(\)/, "an image from anywhere");
  bad(stylesheetProblems(`${css}\n.lights .l1 { background-image: image-set("glow.png" 1x); }\n`), /fetches with image-set\(\)/, "an image without url()");
  bad(stylesheetProblems(`${css}\n.lights .l1 { cursor: url(pointer.png), auto; }\n`), /\{ cursor \} fetches with url\(\)/, "a cursor");
  bad(stylesheetProblems(`${css}\n.lights .l1 { background: u\\72 l(glow.png); }\n`), /holds a backslash/, "url( spelled with an escape");
  bad(stylesheetProblems(`${css}\n@font-face { font-family: "Extra"; font-display: url(swap.png); }\n`), /@font-face \{ font-display \} fetches with url\(\)/, "a url() in a face, outside its src");
  assert.deepEqual(stylesheetProblems(`${css}\n.x::before { content: "url(not a request)"; }\n`), [], "url( inside a string is text");
  // What the browser reads otherwise than these rules is refused, not guessed at.
  const familjen = '  src: url("fonts/FamiljenGrotesk-VF.woff2") format("woff2");\n';
  bad(stylesheetProblems(swap(css, familjen, `${familjen}  src: url("https://example.com/second.woff2") format("woff2");\n`)), /assets\/site\.css @font-face declares src twice/, "a second src, the one the browser uses");
  bad(stylesheetProblems(`${css}\n.lights {\n  --note: "\n  ; background-image: url(https://example.com/p.png); --end: "\n}\n`), /assets\/site\.css has a string that runs across a line break/, "a url() hidden in a string the browser ends at the line break");
  bad(stylesheetProblems(`@layer x "\n" /*\n;@import url(https://example.com/s.css);\n/* */@layer y;\n${css}`), /has a string that runs across a line break/, "an @import hidden behind a broken string and a comment");
  bad(stylesheetProblems(swap(css, 'url("fonts/IBMPlexMono-Medium-Pi.woff2")', "url(fonts/IBMPlexMono-Medium-Pi.woff2)")), /assets\/site\.css writes url\( without quotes/, "a plain url(, which the browser reads to its \")\"");
  bad(stylesheetProblems(`${css}\n<!-- .lights .l1 { opacity: 1 } -->\n`), /assets\/site\.css holds <!-- or -->/, "HTML comment markers");
  bad(stylesheetProblems(`${css}\n.lights .l1 { --x: ( } ; opacity: 1 ) ; }\n`), /assets\/site\.css has brackets that do not pair up/, "a brace inside brackets, which the browser does not close the rule at");
  bad(stylesheetProblems(`${css}\n.lights .l1 { opacity: 1 }\n;\n.lights .l2 { opacity: 1 }\n`), /assets\/site\.css has a ";" that ends no at-rule/, "a stray semicolon, which drops the rule after it");
  assert.deepEqual(stylesheetProblems(`@layer base;\n${css}`), [], "a semicolon that ends an at-rule");
  bad(stylesheetProblems(`${css}\n.lights .l2 { opacity: 1;\n`), /has brackets that do not pair up/, "a rule left open at the end");
  assert.deepEqual(stylesheetProblems(swap(css, 'url("fonts/IBMPlexMono-Medium-Pi.woff2")', 'url( "fonts/IBMPlexMono-Medium-Pi.woff2" )')), [], "a quoted address with spaces around it");
  assert.deepEqual(stylesheetProblems(`${css}\n.lights .l1 { opacity: 1; opacity: 0.5; }\n`), [], "a property written twice outside a face, the usual fallback");
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
  // A theme token set anywhere else paints what the themes and the contrast floors never read.
  bad(stylesheetProblems(`${css}\nbody { --mute: #2A2933; }\n`), /assets\/site\.css body declares --mute, a theme token, outside the dark :root/, "a token repainted on the body");
  bad(stylesheetProblems(`${css}\n@media (min-width: 900px) { :root { --mute: #2A2933; } }\n`), /:root \(inside @media\(min-width:900px\)\) declares --mute, a theme token, outside/, "a dark :root inside another query");
  bad(stylesheetProblems(`${css}\n:root[data-theme=light] { --mute: #9C99AA; }\n`), /:root\[data-theme=light\] declares --mute, a theme token, outside/, "a third light block, spelled without quotes");
  bad(stylesheetProblems(`${css}\n@media (min-width: 900px) { .cmd { --mute: #9C99AA; } }\n`), /\.cmd \(inside @media\(min-width:900px\)\) declares --mute, a theme token, outside/, "a second specimen rule inside a query");
  assert.deepEqual(stylesheetProblems(`${css}\n.lit { --mx: 40%; }\n`), [], "a token of the rule's own, not the theme's");
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
  // A grey that holds on every bare surface (4.86:1) but not under the darkest wash a page may lay on one.
  bad(stylesheetProblems(lightMute("#6A6874")), /light theme: --mute on --\S+ under a 5% #000000 wash is 4\.\d\d:1, below the 4\.5:1 floor/, "a grey a page's wash would push under the floor");
  // Text is painted by its colour alone.
  bad(stylesheetProblems(`${css}\n.fine { color: transparent; }\n`), /\.fine \{ color: transparent \}: text takes/, "transparent text, which a shadow or a background shows through");
  bad(stylesheetProblems(`${css}\n.fine { color: var(--ground); }\n`), /\.fine \{ color: var\(--ground\) \}: text takes/, "the page colour as text, off a fill");
  assert.deepEqual(stylesheetProblems(`${css}\n.fine { background: var(--accent); color: var(--ground); }\n`), [], "the page colour on a violet fill");
  bad(stylesheetProblems(`${css}\n.fine { background: var(--raise); color: var(--ground); }\n`), /\.fine \{ color: var\(--ground\) \}: text takes/, "the page colour on a surface, not a fill");
  bad(stylesheetProblems(`${css}\n.fine { all: initial; }\n`), /\.fine \{ all: initial \} paints text with something other than its colour/, "a reset to the browser's colours");
  bad(stylesheetProblems(`${css}\n.fine { background: var(--ink); -webkit-background-clip: text; }\n`), /\{ -webkit-background-clip: text \} paints text/, "a background clipped to the text");
  bad(stylesheetProblems(swap(css, "  color: var(--ink);\n  font-family: var(--body);", "  color: var(--ink);\n  -webkit-text-stroke: 1px var(--ember);\n  font-family: var(--body);")), /\{ -webkit-text-stroke: 1px var\(--ember\) \} paints text/, "ember stroked round the text");
  bad(stylesheetProblems(`@property --ink { syntax: "<color>"; inherits: false; initial-value: #EDEBF3; }\n${css}`), /assets\/site\.css registers a property \(@property --ink\)/, "a token that stops inheriting");
  bad(stylesheetProblems(`${css}\n.fine { opacity: 0.5; }\n`), /assets\/site\.css \.fine \{ opacity: 0\.5 \} dims or recolours what it is set on/, "text at half strength");
});

test("motion: every animation and hover transform waits for the visitor's permission, or the same selector turns it off", () => {
  const unguarded = swap(css, "  .lights .l1 { animation: drift-a 26s ease-in-out infinite alternate; }\n", "") + "\n.lights .l1 { animation: drift-a 26s ease-in-out infinite alternate; }\n";
  bad(stylesheetProblems(unguarded), /\.lights \.l1 \{ animation: drift-a 26s ease-in-out infinite alternate \} runs whatever the visitor's motion setting/, "a drift outside the block");
  assert.deepEqual(stylesheetProblems(`${unguarded}@media (prefers-reduced-motion: reduce) { .lights .l1 { animation: none; } }\n`), [], "turned off for the same selector when motion is reduced");
  bad(stylesheetProblems(`${unguarded}@media (prefers-reduced-motion: reduce) { .lights .l2 { animation: none; } }\n`), /\.lights \.l1 \{ animation/, "turned off for another selector");
  bad(stylesheetProblems(`${unguarded}@media (prefers-reduced-motion: reduce) { .lights.l1 { animation: none; } }\n`), /\.lights \.l1 \{ animation/, "turned off for an element with both classes, which is not the same");
  assert.deepEqual(stylesheetProblems(`${css}\n.a > .b { animation: drift-a 2s infinite; }\n@media (prefers-reduced-motion: reduce) { .a>.b { animation: none; } }\n`), [], "the same selector written with other spacing");
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
  // Turned off for the same selector when motion is reduced, smooth scrolling meets the setting, and still glides under the pause.
  const offWhenReduced = stylesheetProblems(`${css}\nhtml { scroll-behavior: smooth; }\n@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }\n`);
  assert.ok(!offWhenReduced.some((problem) => /runs whatever/.test(problem)), "smooth scrolling turned off when motion is reduced");
  bad(offWhenReduced, /html \{ scroll-behavior: smooth \} still moves while the visitor has paused motion/, "but not by the pause");
  assert.deepEqual(stylesheetProblems(`${css}\n${PAUSE_GATE} { scroll-behavior: smooth; }\n@media (prefers-reduced-motion: reduce) { ${PAUSE_GATE} { scroll-behavior: auto; } }\n`), [], "smooth scrolling the pause removes, off when motion is reduced");
  bad(stylesheetProblems(`${css}\n@view-transition { navigation: auto; }\n`), /@view-transition \{ navigation: auto \} runs whatever/, "a view transition");
  assert.deepEqual(stylesheetProblems(`${css}\n@media (prefers-reduced-motion: no-preference) and (min-width: 600px) { .x { animation: drift-a 2s infinite; } }\n@media screen and (prefers-reduced-motion: no-preference) { .y { animation: drift-a 2s infinite; } }\n`), [], "the permission joined to other conditions by and");
  bad(stylesheetProblems(`${css}\n@media (prefers-reduced-motion: no-preference), (min-width: 600px) { .x { animation: drift-a 2s; } }\n`), /\.x \{ animation: drift-a 2s \} runs whatever/, "the permission as one of a list");
  // Each of these holds the permission as one "and" term, yet the query matches without it.
  bad(stylesheetProblems(`${css}\n@media (min-width: 600px), (orientation: portrait) and (prefers-reduced-motion: no-preference) { .x { animation: drift-a 2s; } }\n`), /\.x \{ animation: drift-a 2s \} runs whatever/, "the permission in the second query of a list");
  bad(stylesheetProblems(`${css}\n@media ((min-width: 600px) or ((hover: hover) and (prefers-reduced-motion: no-preference) and (pointer: fine))) { .x { animation: drift-a 2s; } }\n`), /\.x \{ animation: drift-a 2s \} runs whatever/, "the permission on one side of an or");
  bad(stylesheetProblems(`${css}\n@media not screen and (prefers-reduced-motion: no-preference) { .x { animation: drift-a 2s; } }\n`), /\.x \{ animation: drift-a 2s \} runs whatever/, "a query that not turns around");
  bad(stylesheetProblems(`${css}\n@media (prefers-reduced-motion: reduce) { .x { animation: drift-a 2s; } }\n`), /\.x \{ animation: drift-a 2s \} runs whatever/, "an animation for the visitors who asked for less motion");
  bad(stylesheetProblems(css.replace(':root[data-motion="paused"] *::after { animation-play-state: paused !important; }', "")), /must pause every animation while the page's motion switch is off/, "no pause");
  // Movement is anything a transition can change but colour and opacity: a shadow or a filter has an offset.
  bad(stylesheetProblems(`${css}\n.rise { transition: -webkit-transform .6s; }\n`), /\.rise \{ transition: -webkit-transform \.6s \} runs whatever/, "a transform behind a vendor prefix");
  bad(stylesheetProblems(`${css}\n.drawer { transition: margin-left .3s ease; }\n`), /\.drawer \{ transition: margin-left \.3s ease \} runs whatever/, "a slide by margin");
  bad(stylesheetProblems(`${css}\n.pop { transition: opacity .2s, top .3s; }\n`), /\.pop \{ transition: opacity \.2s, top \.3s \} runs whatever/, "a drop by offset, beside a fade");
  bad(stylesheetProblems(`${css}\n.pop { transition-property: inset; }\n`), /\.pop \{ transition-property: inset \} runs whatever/, "a move by inset");
  assert.deepEqual(motionProblems(parseCss(".b { transition: color .3s, opacity .2s, outline-color .1s, -webkit-text-fill-color .2s, background-color .2s, fill .2s; }"), "x"), [], "colours and opacity fade; nothing moves");
  bad(stylesheetProblems(`${css}\n.filter:hover { box-shadow: inset 160px 0 0 var(--accent-soft); }\n.filter { transition: box-shadow .6s ease; }\n`), /\.filter \{ transition: box-shadow \.6s ease \} runs whatever/, "a fill swept in by a shadow's offset");
  bad(stylesheetProblems(`${css}\n.t { transition: text-shadow .6s; }\n`), /\.t \{ transition: text-shadow \.6s \} runs whatever/, "a text shadow that slides");
  bad(stylesheetProblems(`${css}\n.t { transition: filter .6s; }\n`), /\.t \{ transition: filter \.6s \} runs whatever/, "a drop shadow in a filter");
  // !important on motion outranks the rules that turn it off, and the pause.
  bad(stylesheetProblems(`${css}\n@media (prefers-reduced-motion: no-preference) { .lights .l1 { animation: drift-a 2s linear infinite !important; } }\n`), /\.lights \.l1 \{ animation \} is !important, which outranks the pause/, "a drift the pause cannot hold");
  bad(stylesheetProblems(`${css}\n@media (prefers-reduced-motion: no-preference) { ${PAUSE_GATE} .x { transition: transform .2s !important; } }\n`), /\{ transition \} is !important/, "a transition marked important");
  bad(stylesheetProblems(`${css}\n@media (prefers-reduced-motion: no-preference) { ${PAUSE_GATE} .x:hover { transform: translateY(-2px) !important; } }\n`), /\.x:hover \{ transform \} is !important/, "a hover lift marked important");
  bad(stylesheetProblems(`${css}\n.lights .l1 { animation-play-state: running !important; }\n`), /\.lights \.l1 \{ animation-play-state \} is !important, which outranks the pause/, "a play state that overrides the pause");
});

test("pause: a loop holds its frame; what would hold a half-finished frame or still answer the pointer, the pause removes", () => {
  const inBlock = (rules) => `${css}\n@media (prefers-reduced-motion: no-preference) { ${rules} }\n`;
  // A one-off entrance, paused before it starts, holds its first frame: text at 30%.
  bad(stylesheetProblems(inBlock(".rise { animation: drift-a .7s ease both; }")), /\.rise \{ animation: drift-a \.7s ease both \} keeps its first frame while the visitor has paused motion/, "an entrance under the pause");
  assert.deepEqual(stylesheetProblems(inBlock(`${PAUSE_GATE} .rise { animation: drift-a .7s ease both; }`)), [], "the entrance removed by the pause");
  assert.deepEqual(stylesheetProblems(inBlock(".spin { animation-name: drift-a; animation-duration: 2s; animation-iteration-count: infinite; }")), [], "a loop counted in its own declaration");
  bad(stylesheetProblems(inBlock(".two { animation: drift-a 2s infinite, drift-b 1s; }")), /\.two \{ animation: drift-a 2s infinite, drift-b 1s \} keeps its first frame/, "a loop beside a one-off");
  bad(stylesheetProblems(inBlock(".spin { animation: drift-a 2s infinite; animation-iteration-count: 1; }")), /\.spin \{ animation: drift-a 2s infinite \} keeps its first frame/, "a loop counted down to once");
  // A hover lift and a transition of movement still run under a pause that only holds animations.
  bad(stylesheetProblems(inBlock(".card:hover { transform: translateY(-2px); }")), /\.card:hover \{ transform: translateY\(-2px\) \} still moves while the visitor has paused motion/, "a hover lift under the pause");
  bad(stylesheetProblems(inBlock(".card { transition: border-color .2s, transform .2s; }")), /\.card \{ transition: border-color \.2s, transform \.2s \} still moves while/, "a lift's transition under the pause");
  bad(stylesheetProblems(inBlock("html { scroll-behavior: smooth; }")), /html \{ scroll-behavior: smooth \} still moves while/, "smooth scrolling under the pause");
  bad(stylesheetProblems(inBlock(`${PAUSE_GATE} .a, .b { transition: transform .2s; }`)), /still moves while/, "the gate on one selector of a list only");
  bad(stylesheetProblems(inBlock(':root:not([data-motion="still"]) .a { transition: transform .2s; }')), /still moves while/, "a gate that is not the pause");
  // The gate is matched as the browser matches it: an attribute value is case-sensitive and keeps its spaces.
  bad(stylesheetProblems(inBlock(':root:not([data-motion="Paused"]) .rise { animation: drift-a .7s ease both; }')), /\.rise \{ animation: drift-a \.7s ease both \} keeps its first frame/, "a gate in other capitals");
  bad(stylesheetProblems(inBlock(':root:not([data-motion="paused "]) .a:hover { transform: translateY(-6px); }')), /\.a:hover \{ transform: translateY\(-6px\) \} still moves while/, "a gate with a space inside the value");
  assert.deepEqual(stylesheetProblems(inBlock(":root:not([data-motion='paused'])  .rise { animation: drift-a .7s ease both; }")), [], "the gate in single quotes, with spaces after it");
  // A loop counted down elsewhere, or counted by a var(), is a one-off.
  bad(stylesheetProblems(`${inBlock(".rise { animation: drift-a .7s ease both infinite; }")}.rise { animation-iteration-count: 1; }\n`), /\.rise \{ animation-iteration-count: 1 \} counts an animation's runs outside the pause gate/, "a loop counted down by a later rule");
  bad(stylesheetProblems(inBlock(".rise { animation: drift-a .7s ease both var(--count, infinite ); }")), /\.rise \{ animation: drift-a \.7s ease both var\(--count, infinite \) \} keeps its first frame/, "a count that only a fallback calls infinite");
  assert.deepEqual(stylesheetProblems(`${inBlock(`.rise { animation: drift-a .7s ease both infinite; } ${PAUSE_GATE} .rise.once { animation-iteration-count: 1; }`)}`), [], "a count the pause removes");
  // Only the pause itself is !important: a play state that says anything else outranks it.
  bad(stylesheetProblems(`${css}\n:root[data-motion="paused"] .lights span { animation-play-state: running !important; }\n`), /\{ animation-play-state \} is !important, which outranks the pause/, "a play state that runs under the pause's own selector");
  bad(stylesheetProblems(`${css}\n:root[data-motion="PAUSED"] .hero > * { animation-play-state: paused !important; }\n`), /\{ animation-play-state \} is !important, which outranks the pause/, "a pause for a value the switch never sets is not the pause");
  // The pause holds the root's own animations too.
  bad(stylesheetProblems(css.replace(':root[data-motion="paused"],\n', "")), /must pause every animation while the page's motion switch is off/, "a pause that leaves the root running");
  bad(stylesheetProblems(css.replace(':root[data-motion="paused"] *::before', ':root[data-motion="PAUSED"] *::before')), /must pause every animation/, "a pause for a value the switch never sets");
  assert.deepEqual(stylesheetProblems(inBlock(`${PAUSE_GATE} .card:hover { transform: translateY(-2px); } ${PAUSE_GATE} .card { transition: transform .2s; } .card { transition: border-color .2s; }`)), [], "movement removed by the pause, colour left to fade");
  // The same holds on a page, and for motion the reduce block turns off: it runs, and pauses, when motion is allowed.
  const check = (html) => pageProblems(html, "index.html", fontFiles, tokens);
  bad(check(withStyle(page, "  .card.flash{animation:deep-link-pulse 2.4s ease-out}\n  @media (prefers-reduced-motion:reduce){.card.flash{animation:none}}")), /index\.html \.card\.flash \{ animation: deep-link-pulse 2\.4s ease-out \} keeps its first frame/, "a one-off pulse the reduce block turns off");
  assert.deepEqual(check(withStyle(page, `  @media (prefers-reduced-motion:no-preference){${PAUSE_GATE} .card.flash{animation:deep-link-pulse 2.4s ease-out}}`)), [], "the pulse removed by the pause");
});

test("pages: the storefront on disk wears the base, and each part of it is required", () => {
  assert.deepEqual(SITE_PAGES, ["index.html"]);
  assert.deepEqual(pageProblems(page, "index.html", fontFiles, tokens), []);
  const check = (html) => pageProblems(html, "index.html", fontFiles, tokens);
  bad(check(swap(page, '<link rel="stylesheet" href="assets/site.css">\n', "")), /index\.html does not link assets\/site\.css/, "no stylesheet");
  bad(check(swap(page, '<link rel="stylesheet" href="assets/site.css">\n<style>', '<style></style>\n<link rel="stylesheet" href="assets/site.css">\n<style>')), /links assets\/site\.css after its own <style>/, "the stylesheet after the page's style");
  bad(check(swap(page, '<span class="l3"></span>', "")), /does not carry the ambient lights/, "a light missing");
  bad(check(swap(page, '<div class="lights" aria-hidden="true">', '<div class="lights">')), /does not carry the ambient lights/, "lights a screen reader would visit");
  bad(check(swap(page, '<span class="l3"></span></div>', '</div><span class="l3"></span>')), /does not carry the ambient lights/, "a light outside the lights");
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
  bad(check(swap(page, "  .finder-empty{margin:0;padding:18px 0 26px;color:var(--mute);", "  .finder-empty{margin:0;padding:18px 0 26px;color:#c7b8ff;")), /\.finder-empty \{ color: #c7b8ff \}: outside a specimen or a theme preview, text takes --ink, --mute, --faint or --accent/, "a literal on the page");
  bad(check(swap(page, "  .finder-empty{margin:0;padding:18px 0 26px;color:var(--mute);", "  .finder-empty{margin:0;padding:18px 0 26px;color:var(--syntax-light-purple);")), /\{ color: var\(--syntax-light-purple\) \}: outside a specimen or a theme preview, text takes/, "the coding palette on the light page");
  bad(check(swap(page, `    ${PAUSE_GATE} .skip-link{transition:transform .15s ease}\n`, "").replace("  .skip-link:focus{", "  .skip-link{transition:transform .15s ease}\n  .skip-link:focus{")), /\.skip-link \{ transition: transform \.15s ease \} runs whatever/, "a slide outside the block");
  bad(check(swap(page, '<link rel="stylesheet" href="assets/site.css">', '<link rel="stylesheet" href="assets/site.css">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk">')), /fetches a font from Google/, "a third-party font");
  bad(check(swap(page, 'href="assets/fonts/FamiljenGrotesk-VF.woff2"', 'href="assets/fonts/Other.woff2"')), /preloads the font assets\/fonts\/Other\.woff2, which no @font-face/, "a preload for nothing");
  bad(check(swap(page, 'type="font/woff2" crossorigin>', 'type="font/woff2">')), /without crossorigin/, "a preload fetched twice");
  bad(check(swap(page, "    .theme-monolith{animation:monolith-float 5s ease-in-out infinite}\n", "").replace("  @media (prefers-reduced-motion:no-preference){\n", "  .theme-monolith{animation:monolith-float 5s ease-in-out infinite}\n  @media (prefers-reduced-motion:no-preference){\n")), /index\.html \.theme-monolith \{ animation: monolith-float 5s ease-in-out infinite \} runs whatever/, "the page's own animation outside the block");
  bad(check(swap(page, "  .syntax-version{color:var(--accent)}", "  .syntax-version{color:var(--ember)}")), /index\.html \.syntax-version \{ color: var\(--ember\) \}: ember is a point, never text/, "ember as the page's text");
  // A loop the reduce block turns off for the same selector runs only when motion is allowed, and the pause holds it.
  assert.deepEqual(check(withStyle(page, "  .card.flash{animation:deep-link-pulse 2.4s ease-out infinite}\n  @media (prefers-reduced-motion:reduce){.card.flash{animation:none}}")), []);
  // The same loop written after the reduce block outranks it, and runs.
  bad(check(withStyle(page, "  @media (prefers-reduced-motion:reduce){.card.flash{animation:none}}\n  .card.flash{animation:deep-link-pulse 2.4s ease-out infinite}")), /\.card\.flash \{ animation: deep-link-pulse 2\.4s ease-out infinite \} runs whatever/, "a pulse after the rule that turns it off");
  // The page's own one-off entrance, under the pause, held the hero's opening lines at 30%.
  bad(check(swap(page, `    ${PAUSE_GATE} .hero-layout:not(.risen)>div:first-child>*{animation:hero-rise .7s ease both}`, "    .hero-layout:not(.risen)>div:first-child>*{animation:hero-rise .7s ease both}")), /index\.html \.hero-layout:not\(\.risen\)>div:first-child>\* \{ animation: hero-rise \.7s ease both \} keeps its first frame while the visitor has paused motion/, "the hero's entrance under the pause");
  bad(check(withStyle(page, "  @media (prefers-reduced-motion:no-preference){.tool:hover{transform:translateY(-2px)}}")), /index\.html \.tool:hover \{ transform: translateY\(-2px\) \} still moves while the visitor has paused motion/, "a card lift under the pause");
  bad(check(withStyle(page, "  @media (prefers-reduced-motion:no-preference){.monolith-mark{animation:mark-spin 4s linear infinite!important}}\n  @keyframes mark-spin{to{transform:rotate(360deg)}}")), /index\.html \.monolith-mark \{ animation \} is !important, which outranks the pause/, "a page loop the pause cannot hold");
  bad(check(withStyle(page, "  .monolith-mark{animation:mark-spin 4s linear infinite!important}\n  @keyframes mark-spin{to{transform:rotate(360deg)}}\n  @media (prefers-reduced-motion:reduce){.monolith-mark{animation:none}}")), /\.monolith-mark \{ animation \} is !important/, "an animation that outranks the rule turning it off");

  // Switches the script must show: the motion switch whenever motion is allowed, the theme switch always.
  bad(check(swap(page, "    motionSwitch.hidden = !allowsMotion.matches;\n", "    motionSwitch.hidden = true;\n")), /does not work the motion switch/, "a motion switch that never shows");
  bad(check(swap(page, "    motionSwitch.hidden = !allowsMotion.matches;\n", "    motionSwitch.hidden = !allowsMotion.matches;\n    motionSwitch.hidden = true;\n")), /does not work the motion switch/, "a motion switch shown, then hidden again");
  bad(check(swap(page, 'const allowsMotion = window.matchMedia("(prefers-reduced-motion: no-preference)");', 'const allowsMotion = window.matchMedia("(prefers-reduced-motion: reduce)");')), /does not work the motion switch/, "a motion switch for the visitors who asked for less motion");
  bad(check(swap(page, "  themeSwitch.hidden = false;\n", "  themeSwitch.hidden = true;\n  copyStatus.hidden = false;\n")), /does not work the theme switch/, "another element shown in the theme switch's place");

  // A specimen is the element the selector names, or one inside it: not its opposite, a neighbour or a parent.
  bad(check(withStyle(page, "  body:not(.cmd){--ink:#e9eaec}")), /index\.html body:not\(\.cmd\) re-declares --ink, a token of assets\/site\.css/, "a page token on everything but a specimen");
  bad(check(withStyle(page, "  .lede:has(.specimen){color:#c7b8ff}")), /\.lede:has\(\.specimen\) \{ color: #c7b8ff \}: outside a specimen/, "a parent of a specimen");
  bad(check(withStyle(page, "  .cmd+p{color:var(--syntax-blue)}")), /\.cmd\+p \{ color: var\(--syntax-blue\) \}: outside a specimen/, "a neighbour of a specimen");
  bad(check(withStyle(page, '  [data-note=".cmd"] p{color:#c7b8ff}')), /\{ color: #c7b8ff \}: outside a specimen/, "a specimen's name in an attribute value");
  assert.deepEqual(check(withStyle(page, "  .install .cmd:not(.wide) .syntax-type{color:var(--syntax-light-blue)}")), [], "a specimen narrowed by :not()");
  bad(check(withStyle(page, "  .cmd .syntax-type,.lede{color:#c7b8ff}")), /\.cmd \.syntax-type,\.lede \{ color: #c7b8ff \}: outside a specimen/, "a specimen beside a selector outside it");
  bad(check(withStyle(page, "  .cmdline p{color:#c7b8ff}")), /\.cmdline p \{ color: #c7b8ff \}: outside a specimen/, "a class that only begins with a specimen's name");
  bad(check(withStyle(page, "  .lede[data-x=a\\.cmd]{color:#c7b8ff}")), /\{ color: #c7b8ff \}: outside a specimen/, "a specimen's name escaped into an attribute value");
  bad(check(withStyle(page, '  .lede[data-x="] .cmd ["]{color:#c7b8ff}')), /\{ color: #c7b8ff \}: outside a specimen/, "a bracket inside an attribute's string");
  bad(check(withStyle(page, "  .card{--ink:#e9eaec}")), /index\.html \.card re-declares --ink, a token of assets\/site\.css/, "a theme preview keeps the page's ink; only a specimen has its own");
  // Text takes the shared text tokens outside a specimen or a theme preview, so a colour cannot hide in a token of the page's own.
  bad(check(swap(swap(page, "    --radius:10px;\n", "    --radius:10px;\n    --note:#c7b8ff;\n"), "  .finder-empty{margin:0;padding:18px 0 26px;color:var(--mute);", "  .finder-empty{margin:0;padding:18px 0 26px;color:var(--note);")), /\.finder-empty \{ color: var\(--note\) \}: outside a specimen or a theme preview/, "a literal in a token of the page's own");
  bad(check(swap(page, "  .finder-empty{margin:0;padding:18px 0 26px;color:var(--mute);", "  .finder-empty{margin:0;padding:18px 0 26px;color:var(--fg);")), /\.finder-empty \{ color: var\(--fg\) \}: outside a specimen or a theme preview/, "a theme preview's colour outside it");
  assert.deepEqual(THEME_PREVIEWS, [".theme-monolith", ".pick", ".card"]);
  // Inside a specimen or a theme preview, text takes its own colours, never a literal.
  bad(check(swap(page, ".card .term .hint{margin-top:8px;font-size:10.5px;color:var(--mut)}", ".card .term .hint{margin-top:8px;font-size:10.5px;color:#2A2933}")), /\.card \.term \.hint \{ color: #2A2933 \}: inside a specimen or a theme preview, text takes .* not a literal/, "a literal in a theme card");
  bad(check(withStyle(page, "  .card .term .hint{color:var(--mut,#2A2933)}")), /inside a specimen or a theme preview, text takes/, "a literal behind a fallback");
  // A sibling after a step into the specimen is still inside it; one beside the specimen is not.
  assert.deepEqual(check(withStyle(page, "  .cmd .syntax-command+.syntax-keyword{color:var(--syntax-purple)}")), [], "a sibling inside the specimen");
  assert.deepEqual(check(withStyle(page, "  .lede+.cmd .syntax-keyword{color:var(--syntax-purple)}")), [], "a specimen that follows a sibling");
  bad(check(withStyle(page, "  .cmd~p{color:var(--syntax-purple)}")), /\.cmd~p \{ color: var\(--syntax-purple\) \}: outside a specimen/, "a later sibling of a specimen");
  assert.deepEqual(check(withStyle(page, "  .card>.term .hint{color:var(--mut)}")), [], "a child of a theme preview");
  // Outside one, the page's text and surfaces take the shared tokens.
  bad(check(swap(page, "  .finder-empty{margin:0;padding:18px 0 26px;color:var(--mute);", "  .finder-empty{margin:0;padding:18px 0 26px;color:var(--ground);")), /\.finder-empty \{ color: var\(--ground\) \}: outside a specimen or a theme preview, text takes/, "the page colour as text off a fill");
  bad(check(withStyle(page, "  .lede{color:transparent;text-shadow:0 0 0 #EDEBF3}")), /\.lede \{ color: transparent \}: outside a specimen/, "text drawn by its shadow");
  bad(check(withStyle(page, "  .lede{-webkit-text-stroke:1px var(--ember)}")), /index\.html \.lede \{ -webkit-text-stroke: 1px var\(--ember\) \} paints text/, "a stroke round the page's text");
  bad(check(withStyle(page, '  @property --ink{syntax:"<color>";inherits:false;initial-value:#EDEBF3}')), /index\.html registers a property/, "a token re-registered on the page");
  // Opacity, filters and blends stay off text: a ::before or ::after, an image or a mark only.
  bad(check(withStyle(page, "  .lede{opacity:.25}")), /index\.html \.lede \{ opacity: \.25 \} dims or recolours/, "the page's text at a quarter");
  bad(check(withStyle(page, "  .lede{filter:invert(1)}")), /\.lede \{ filter: invert\(1\) \} dims or recolours/, "the page's text inverted");
  bad(check(withStyle(page, "  .lede{backdrop-filter:invert(1)}")), /\.lede \{ backdrop-filter: invert\(1\) \} dims or recolours/, "the surface behind the text inverted");
  bad(check(withStyle(page, "  .lede{mix-blend-mode:difference}")), /\.lede \{ mix-blend-mode: difference \} dims or recolours/, "the text blended into its surface");
  assert.deepEqual(check(withStyle(page, "  .lede{opacity:1}\n  .lede::after{opacity:.5}\n  .product-proof img{filter:grayscale(1)}\n  .card .dots b{opacity:.3}")), [], "full strength, a pseudo-element, an image and a mark");
  bad(check(withStyle(page, "  .tool{background:#16161C}")), /index\.html \.tool \{ background: #16161C \}: outside a specimen or a theme preview, a surface takes the shared tokens/, "a dark card that stays dark in the light theme");
  bad(check(withStyle(page, "  .tool{background:var(--terminal-surface)}")), /\.tool \{ background: var\(--terminal-surface\) \}: .* --terminal-surface is neither/, "a surface in a token of the page's own");
  bad(check(withStyle(page, "  .tool{background-image:linear-gradient(#16161C,#16161C)}")), /\.tool \{ background-image: linear-gradient\(#16161C,#16161C\) \}: outside a specimen or a theme preview, a surface takes/, "a surface painted as a gradient");
  bad(check(withStyle(page, "  .tool{background:rgba(255,255,255,.06)}")), /\.tool \{ background: rgba\(255,255,255,\.06\) \}: .* a wash of white or black at most 5% opaque/, "a wash thicker than the floors allow");
  bad(check(withStyle(page, "  .tool{background:rgba(168,152,255,.04)}")), /\.tool \{ background: rgba\(168,152,255,\.04\) \}: .* a wash of white or black at most 5% opaque/, "a thin wash of a colour");
  assert.deepEqual(check(withStyle(page, "  .tool{background:rgba(0,0,0,.05)}")), [], "the thickest wash allowed");
  // The specimen's ink is the one value scripts/verify-contrast.mjs reads, the first on the page.
  bad(check(withStyle(page, "  .cmd{--ink:#2A2933;}")), /\.cmd \{ --ink: #2A2933 \}: scripts\/verify-contrast\.mjs holds the first --ink the page declares, #e9eaec/, "a second ink in the specimen");
  bad(check(swap(page, "  .cmd{--ink:#e9eaec;}", "  /* --ink:#e9eaec; */ .cmd{--ink:#2A2933;}")), /\.cmd \{ --ink: #2A2933 \}: scripts\/verify-contrast\.mjs holds the first --ink/, "the ink that script reads only in a comment");

  // Links and styles as a browser reads them.
  const afterSheet = (markup) => swap(page, '<link rel="stylesheet" href="assets/site.css">', `<link rel="stylesheet" href="assets/site.css">\n${markup}`);
  bad(check(afterSheet('<link rel="stylesheet" href="\\\\fonts.bunny.net/css?family=x">')), /links \\\\fonts\.bunny\.net\/css\?family=x \(stylesheet\) from another host/, "a host behind backslashes");
  bad(check(afterSheet('<link rel="stylesheet" href="&#47;&#47;fonts.bunny.net/css">')), /from another host/, "a host behind character references");
  bad(check(afterSheet('<link rel="preconnect" href="/&NewLine;/fonts.bunny.net">')), /from another host/, "a host behind a named newline");
  bad(check(afterSheet('<link rel="preconnect" href="&#x2F;&#x2F;fonts.bunny.net">')), /from another host/, "a host behind hexadecimal references");
  bad(check(afterSheet('<link rel="dns-prefetch" href="&lowbar;fonts.bunny.net">')), /from another host/, "an address holding a reference these rules do not decode");
  assert.deepEqual(check(swap(page, '<link rel="stylesheet" href="assets/site.css">', '<link rel="stylesheet" href="assets&sol;site.css">')), [], "the stylesheet's address spelled with a named reference is the stylesheet");
  bad(check(swap(page, '<link rel="stylesheet" href="assets/site.css">', '<link rel="alternate stylesheet" title="Look" href="assets/site.css">')), /index\.html does not link assets\/site\.css/, "the stylesheet as an alternate the visitor never sees");
  bad(check(afterSheet('<link rel="stylesheet" href="assets/extra.css">')), /index\.html links assets\/extra\.css as a stylesheet; its rules are not read here/, "a second stylesheet of the site's own");
  bad(check(swap(page, '<p class="lede">', '<p class="lede" style="color:#c7b8ff">')), /index\.html has a style attribute that sets color/, "text coloured in a style attribute");
  bad(check(swap(page, '<p class="monolith-mark" aria-hidden="true">', '<p class="monolith-mark" aria-hidden="true" style="animation:mark-spin 4s linear infinite">')), /index\.html has a style attribute that sets animation/, "motion in a style attribute");
  bad(check(swap(page, '<p class="lede">', '<p class="lede" style="--mute:#2A2933">')), /index\.html has a style attribute that re-declares --mute/, "a shared token in a style attribute");
  bad(check(swap(page, '<p class="lede">', '<p class="lede" style="--x:1&#59 color:#c7b8ff">')), /index\.html has a style attribute that sets color/, "a declaration split by a reference without its semicolon");
  bad(check(swap(page, '<p class="lede">', '<p class="lede" style="--x:1;anim\\61tion:nudge 2s infinite">')), /index\.html has a style attribute that holds a backslash/, "a property spelled with an escape in a style attribute");
  // The page's own <style> is read as the stylesheet is: no escapes, and for every medium.
  bad(check(withStyle(page, "  .tool:\\68over{tr\\61nsform:translateY(-6px)}")), /index\.html's <style> holds a backslash/, "a hover lift spelled with escapes");
  bad(check(swap(page, "</style>\n", '</style>\n<style media="print">@media (prefers-reduced-motion:reduce){.theme-monolith{animation:none}}</style>\n')), /index\.html has a <style media="print">/, "a reduce rule that applies only in print");
  bad(check(swap(page, '<p class="lede">', '<marquee>50 themes</marquee>\n<p class="lede">')), /index\.html carries a <marquee>/, "text that scrolls itself");
  bad(check(swap(page, "</style>\n", '</style>\n<style type="text/plain">@media (prefers-reduced-motion:reduce){.theme-monolith{animation:none}}</style>\n')), /index\.html has a <style type="text\/plain">/, "a reduce rule the browser does not apply");
  bad(check(swap(page, '<link rel="stylesheet" href="assets/site.css">', '<link rel="stylesheet" href="assets/site.css" type="text/plain">')), /links assets\/site\.css with type="text\/plain"/, "a stylesheet the browser does not load as CSS");
  // The markup is read as the browser's tokenizer reads it: comments, end tags and quoted values end where the browser ends them.
  const afterStyle = (markup) => swap(page, "</style>\n", `</style>\n${markup}\n`);
  bad(check(afterStyle('<!-->\n<style>@import url("https://example.com/a.css");</style>\n<!-- end -->')), /index\.html's <style> uses @import/, "a style after a comment that ends at once");
  bad(check(afterStyle('<!-- a --!>\n<style>@import url("https://example.com/b.css");</style>\n<!-- end -->')), /index\.html's <style> uses @import/, "a style after a comment ended with --!>");
  bad(check(swap(page, "</style>\n", '</style/>\n<meta name="x" content=/*>\n<style>@import url("https://example.com/c.css");</style>\n')), /index\.html's <style> uses @import/, "a style after an end tag with a slash");
  bad(check(afterStyle('<style title="a>/*">@import url("https://example.com/d.css");</style>')), /index\.html's <style> uses @import/, "a style whose attribute holds a >");
  bad(check(afterStyle('<link href="https://example.com/e.css" title="a>b" rel="stylesheet">')), /links https:\/\/example\.com\/e\.css \(stylesheet\) from another host/, "a stylesheet whose attribute holds a >");
  bad(check(afterSheet('<link rel="preconnect" href="https://fonts.bunny.net" href="assets/fonts/">')), /links https:\/\/fonts\.bunny\.net \(preconnect\) from another host/, "a repeated attribute, of which the browser keeps the first");
  bad(check(swap(page, '<p class="lede">', '<p class="lede" style=color:#c7b8ff>')), /index\.html has a style attribute that sets color/, "a style attribute without quotes");
  // The page's styles fetch nothing but their own @font-face files, read entry by entry.
  bad(check(withStyle(page, '  body{background-image:url("https://example.com/bg.png")}')), /index\.html body \{ background-image \} fetches with url\(\)/, "a background from anywhere");
  bad(check(swap(page, '<p class="lede">', '<p class="lede" style="background:url(&quot;https://example.com/bg.png&quot;)">')), /index\.html has a style attribute that fetches with url\(\)/, "a background in a style attribute");
  bad(check(withStyle(page, '  @font-face{font-family:"Own";src:url("assets/fonts/FamiljenGrotesk-VF.woff2") format("woff2");src:url("https://example.com/own.woff2") format("woff2")}')), /index\.html @font-face declares src twice/, "a page face with a second src");
  bad(check(withStyle(page, '  @font-face{font-family:"Own";src:url("assets/fonts/FamiljenGrotesk-VF.woff2") format("woff2") url("https://example.com/own.woff2")}')), /index\.html @font-face for "Own" has a src entry these rules cannot read/, "a page face entry these rules cannot read");
  bad(check(withStyle(page, '  .lede::before{content:"\n"}')), /index\.html's <style> has a string that runs across a line break/, "a broken string on the page");
  bad(check(swap(page, '<p class="lede">', '<p class="lede" style="--x:);color:#c7b8ff">')), /index\.html: a style attribute has brackets that do not pair up/, "a declaration hidden behind a bracket in a style attribute");
  bad(check(withStyle(page, "  <!-- body{--ink:#EDEBF3} -->")), /index\.html's <style> holds <!-- or -->/, "a rule between HTML comment markers, which CSS skips");
  bad(check(swap(page, '<p class="lede">', '<p class="lede" title="<!--" style="color:#ff0000" data-x="-->">')), /index\.html has a style attribute that sets color/, "comment markers inside attribute values");
  bad(check(swap(page, '<p class="lede">', '<p class="lede"style="color:#ff0000">')), /has a style attribute that sets color/, "a style attribute straight after a quoted value");
  bad(check(swap(page, '<h1>', '<h1/style="color:#ff0000">')), /has a style attribute that sets color/, "a style attribute after a slash");
  bad(check(swap(page, '<p class="lede">', '<p class="lede" style="background:#16161C">')), /has a style attribute that sets background/, "a surface in a style attribute");
});

test("fonts: each face loads a file that is there, each file is used, and each family carries the OFL", async () => {
  const files = await fontDirectory();
  // The Familiars page still loads its own faces (main's #65 and its follow-ups); those files count as used.
  const familiarsFonts = pageFontFiles(await readFile(new URL("familiars.html", root), "utf8"), "familiars.html");
  assert.ok(familiarsFonts.length > 0);
  assert.deepEqual(fontProblems(css, files, familiarsFonts), []);
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
  assert.deepEqual(fontProblems(css, { ...files, "Spare.woff2": true }, [...familiarsFonts, ...pageFontFiles(ownFaces, "familiars.html")]), []);
  bad(fontProblems(css, { ...files, "Spare.woff2": true }, pageFontFiles(ownFaces, "guide/index.html")), /assets\/fonts\/Spare\.woff2 is not loaded by any @font-face/, "a page url that resolves somewhere else");
  bad(fontProblems(css.replace('url("fonts/IBMPlexMono-Medium-Latin1.woff2")', 'url("https://example.com/IBMPlexMono-Medium-Latin1.woff2")'), files), /loads https:\/\/example\.com\/IBMPlexMono-Medium-Latin1\.woff2 from another host/, "a face served from elsewhere");
  bad(fontProblems(css.replace('url("fonts/IBMPlexMono-Medium-Latin1.woff2")', 'url("https://cdn.example.net/assets/fonts/IBMPlexMono-Medium-Latin1.woff2")'), files), /loads https:\/\/cdn\.example\.net\/assets\/fonts\/IBMPlexMono-Medium-Latin1\.woff2 from another host/, "a face from another host under the same path");
  // Every src a face declares is read, entry by entry, and an entry these rules cannot read is reported.
  const familjen = '  src: url("fonts/FamiljenGrotesk-VF.woff2") format("woff2");\n';
  bad(fontProblems(css.replace(familjen, `${familjen}  src: url("https://example.com/second.woff2") format("woff2");\n`), files), /loads https:\/\/example\.com\/second\.woff2 from another host/, "a second src");
  bad(fontProblems(css.replace(familjen, '  src: url("https://example.com/f.woff2\'") format("woff2"), url("fonts/FamiljenGrotesk-VF.woff2") format("woff2");\n'), files), /loads https:\/\/example\.com\/f\.woff2' from another host/, "a quote inside a quoted address");
  bad(fontProblems(css.replace(familjen, '  src: url("fonts/FamiljenGrotesk-VF.woff2") format("woff2") url("https://example.com/g.woff2");\n'), files), /"Familjen Grotesk" has a src entry these rules cannot read, url\("fonts\/FamiljenGrotesk-VF\.woff2"\) format\("woff2"\) url/, "two addresses in one entry");
  assert.deepEqual(
    fontFaces('@font-face{font-family:"A";src:local("A"),url( "a.woff2" ) format("woff2") tech(variations),URL(\'b.woff2\'),url(c.woff2)}').map(({ urls, unread }) => [urls, unread]),
    [[["assets/a.woff2", "assets/b.woff2", "assets/c.woff2"], []]],
    "local(), hints, either quote and a plain address are read",
  );
  assert.equal(fontFaces('@font-face{font-family:"A";font-family:"B";src:url("b.woff2")}')[0].family, "B", "the family the browser takes, the last");
  assert.deepEqual(pageFontFiles(`<!-- ${ownFaces} -->`, "familiars.html"), [], "a face in a comment loads nothing");
});

// --- the verifier on the real files -----------------------------------------------------------

// A fixture holds only what git would commit, as in scripts/verify.test.mjs: a
// sample pack a product's generator wrote (ignored) must not turn these tests
// red, as it does not turn verify red.
let ignoredPaths = [];
try {
  ignoredPaths = execFileSync("git", ["ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--directory"], { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split("\0")
    .filter(Boolean)
    .map((path) => path.replace(/\/$/, ""));
} catch {
  ignoredPaths = [];
}

async function makeFixture(t) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gabs-site-style-"));
  const fixtureRoot = join(temporaryRoot, "repo");
  await cp(projectRoot, fixtureRoot, {
    recursive: true,
    filter(source) {
      const pathFromRoot = relative(projectRoot, source);
      const path = pathFromRoot.split(sep).join("/");
      const isIgnored = ignoredPaths.some((ignored) => path === ignored || path.startsWith(`${ignored}/`));
      return !isIgnored && ![".git", ".worktrees", "node_modules"].some((directory) => pathFromRoot === directory || pathFromRoot.startsWith(`${directory}${sep}`));
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

test("the verifier fails a colour off the palette, a light theme that splits, a page off the base, motion against the setting or the pause and a font without its licence, and passes the site as it is", async (t) => {
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
  await editOnce(fixtureRoot, "index.html", "  @media (prefers-reduced-motion:no-preference){\n", "  .theme-monolith{animation:monolith-float 5s ease-in-out infinite}\n  @media (prefers-reduced-motion:no-preference){\n");
  await expectRed(fixtureRoot, /index\.html \.theme-monolith \{ animation: monolith-float 5s ease-in-out infinite \} runs whatever the visitor's motion setting/);
  await editOnce(fixtureRoot, "index.html", "  .theme-monolith{animation:monolith-float 5s ease-in-out infinite}\n  @media (prefers-reduced-motion:no-preference){\n", "  @media (prefers-reduced-motion:no-preference){\n");
  await editOnce(fixtureRoot, "index.html", `    ${PAUSE_GATE} .hero-layout:not(.risen)>div:first-child>*{animation:hero-rise .7s ease both}`, "    .hero-layout:not(.risen)>div:first-child>*{animation:hero-rise .7s ease both}");
  await expectRed(fixtureRoot, /index\.html \.hero-layout:not\(\.risen\)>div:first-child>\* \{ animation: hero-rise \.7s ease both \} keeps its first frame while the visitor has paused motion/);
  await editOnce(fixtureRoot, "index.html", "    .hero-layout:not(.risen)>div:first-child>*{animation:hero-rise .7s ease both}", `    ${PAUSE_GATE} .hero-layout:not(.risen)>div:first-child>*{animation:hero-rise .7s ease both}`);
  await editOnce(fixtureRoot, "index.html", "    --radius:10px;\n", "    --radius:10px;\n    --mute:#2A2933;\n");
  await expectRed(fixtureRoot, /index\.html :root re-declares --mute, a token of assets\/site\.css/);
  await editOnce(fixtureRoot, "index.html", "    --radius:10px;\n    --mute:#2A2933;\n", "    --radius:10px;\n");
  await rm(join(fixtureRoot, "assets/fonts/OFL-FamiljenGrotesk.txt"));
  await expectRed(fixtureRoot, /assets\/fonts\/OFL-FamiljenGrotesk\.txt is missing or is not the SIL Open Font License/);
  await cp(join(projectRoot, "assets/fonts/OFL-FamiljenGrotesk.txt"), join(fixtureRoot, "assets/fonts/OFL-FamiljenGrotesk.txt"));
  await expectGreen(fixtureRoot);
});
