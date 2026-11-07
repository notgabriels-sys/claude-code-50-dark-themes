// The site wears the Familiars page's look through one shared stylesheet, assets/site.css, and
// the pages listed in SITE_PAGES build their own layout on top of it. These rules hold the
// stylesheet and those pages to what the look promises a reader:
//
// 1. Palette. Every colour written in assets/site.css is one of the house palette's sixteen
//    (PALETTE below, dark and light, from the design base), at any opacity. transparent and
//    currentColor are not colours of their own; colour functions other than rgb() and rgba(),
//    named and system colours, and inline data: images are not used, and color-mix() mixes only
//    tokens, so every colour can be read against the table.
// 2. Two themes. The light theme is declared twice: inside @media (prefers-color-scheme: light)
//    for :root:not([data-theme="dark"]), the visitor whose system is light and who has not chosen
//    dark on the switch, and as :root[data-theme="light"], the visitor who chose light. The two
//    declare the same tokens with the same values, and between them every token of the dark
//    :root that holds a colour, so no colour stays dark by omission. A specimen (.specimen,
//    .cmd: a terminal shown on the page) re-declares tokens only to the dark theme's values.
//    A theme token is declared nowhere else in the stylesheet, and a page's own <style> or style
//    attributes re-declare none of them, so what the page paints with is what these rules read;
//    the one exception is the install command's plain text (--ink inside .cmd), which is the
//    shared coding palette's and is held by scripts/verify-contrast.mjs, which reads the first
//    --ink on the page, so the page gives it that one value.
// 3. Contrast, in each theme, with WCAG 2.x's formula: every text token on every surface at
//    4.5:1, the floor for normal text, including over the violet wash of a selected chip; the
//    page colour on an ink fill (the primary pill's label) at 4.5:1; and the two marks that are
//    never text (the ember point, and the sun or moon on the switch's violet knob) at 3:1, the
//    floor for graphical objects. Ember is held to the lower floor because it is never text:
//    no color declaration in the stylesheet or a page's <style> uses it. Text in the stylesheet
//    takes only the text tokens, and so does text in a page's <style> outside a specimen or a
//    theme preview (THEME_PREVIEWS: a theme shown in its own colours, whose contrast is the
//    theme's, not this file's); inside one it takes the specimen's or the preview's own colours,
//    never a literal, and no surface, line or wash token. --ground is text only on an ink or
//    violet fill set in the same rule. Text is painted by its colour alone (no `all`, no
//    background clipped to the text, no stroke, no transparent fill), and opacity, filters and
//    blend modes are set only on marks that hold no text (MARKS). A page's surfaces outside a
//    specimen or a preview take the shared tokens, or a white or black wash thin enough that
//    every text token keeps its floor under it, which is measured here too; and no token is
//    registered with @property, which could stop it inheriting. A selector is inside a specimen
//    when the specimen is the element it names or an ancestor of it.
// 4. Motion only when the visitor allows it. Every animation, every transition of anything but
//    colour or opacity (a shadow or a filter has an offset that moves), smooth scrolling, view
//    transitions and every transform on :hover, in the stylesheet and in a page's own <style>,
//    sits inside @media (prefers-reduced-motion: no-preference), or, for an animation, a transition or smooth
//    scrolling, a later rule for the same selector turns it off inside
//    @media (prefers-reduced-motion: reduce). With reduced motion on, nothing moves; with it off,
//    the page offers a control that pauses motion (WCAG 2.2.2). The pause holds every looping
//    animation where it is, the root's own included; whatever else moves (a one-off animation,
//    which would hold its first frame, a count that turns a loop into one, a transition of
//    movement, smooth scrolling, a hover transform) is written under
//    :root:not([data-motion="paused"]), so the pause removes it. Selectors are matched as the
//    browser matches them: case kept, and the space that is a descendant combinator kept. No
//    motion is !important but the pause, and a page carries no <marquee>.
// 5. The pages on the base link assets/site.css before their own <style>, and no other
//    stylesheet, so the page's layout builds on the shared tokens; carry the ambient lights, the
//    theme switch, wired to the key the Familiars page keeps the choice under, so one choice
//    holds across the site, and the motion switch, shown whenever motion is allowed; preload no
//    font the stylesheet does not use; fetch no font or stylesheet from another host, read as a
//    browser reads the address, and nothing from their styles but their own @font-face files;
//    use a style attribute only for a theme preview's own colours, as custom properties;
//    and, like the stylesheet, write no backslash in their styles and no <style> for another
//    medium or of another type, so what these rules read is what the browser applies. The
//    markup is read with the HTML tokenizer's rules (scripts/html-tags.mjs), the reader
//    verify.mjs holds every page to, so a comment, an end tag or an attribute ends where the
//    browser ends it.
// 6. Fonts. Every @font-face in the stylesheet points at a file in assets/fonts, every font file
//    there is loaded by an @font-face (the stylesheet's, or one in a page's own <style> that has
//    not moved onto the base yet), and every family in the stylesheet ships with its SIL Open Font
//    License, which both fonts are under.
// 7. Requests. Those font files are the only requests the stylesheet makes: no @import, no url(),
//    image-set() or src() outside an @font-face's src, every entry of a src read as url("…")
//    with format() or tech(), or local(), each descriptor written once, and no backslash, which
//    as a CSS escape could spell one. So scripts/verify.mjs, which refuses every other served
//    stylesheet because it cannot read what CSS fetches, serves this one.
//
// The rules read CSS as written, flat: a style rule nested inside another is refused rather than
// guessed at, and an !important on a token, which would outrank both light declarations, is too.
// So is every shape the browser reads otherwise: a string broken across lines, a url( without
// quotes, brackets that do not pair up, <!-- or -->, and a ";" that ends no at-rule.
// They read a page's markup and styles, and its script only for how it works the two switches:
// a style the script sets at run time is not seen here.
//
// What cannot pass is a colour the design base does not name, a light theme that differs by
// which way the visitor arrived at it, text below the floor in either theme, motion that runs
// against a visitor's setting, a page that drops the base, or a font served without its licence.

import { htmlTags } from "./html-tags.mjs";

export const STYLESHEET = "assets/site.css";
export const SITE_PAGES = ["index.html"];
export const THEME_KEY = "familiars-theme";
export const MOTION_KEY = "familiars-motion";
// The page's theme previews: a theme shown in its own colours on its own ground (the hero's
// specimen, a finder pick, a gallery card). Text inside one paints with the theme's colours.
export const THEME_PREVIEWS = [".theme-monolith", ".pick", ".card"];

// The design base's palette (/mnt/project-files/design/STYLE.md), by role.
export const PALETTE = {
  dark: { bg: "#0F0F13", surface: "#16161C", raise: "#1C1C24", fg: "#EDEBF3", muted: "#9C99AA", line: "#2A2933", accent: "#A898FF", ember: "#FFB46B" },
  light: { bg: "#F2F1F6", surface: "#FFFFFF", raise: "#F8F7FB", fg: "#16151C", muted: "#5C5A6A", line: "#DAD8E2", accent: "#5A45D6", ember: "#B8601A" },
};

// [foreground, background, floor, where the pair appears]. A background written "a over b" is
// token a (a colour with opacity) laid over token b.
const TEXT_TOKENS = ["ink", "mute", "faint", "accent"];
const SURFACES = ["ground", "ground-2", "raise"];
export const CONTRAST_PAIRS = [
  ...TEXT_TOKENS.flatMap((text) => SURFACES.map((surface) => [text, surface, 4.5, "text"])),
  ...["ink", "accent"].flatMap((text) => ["ground", "ground-2"].map((surface) => [text, `accent-soft over ${surface}`, 4.5, "text on a selected chip or a hovered button"])),
  ["ground", "ink", 4.5, "the primary pill's label on its ink fill"],
  ...SURFACES.map((surface) => ["ember", surface, 3, "the ember point, never text"]),
  ["ground", "accent", 3, "the switch's sun or moon on its violet knob"],
];

const WASH_ALPHA = 0.05;
const LIGHT_BY_SYSTEM = { context: "@media(prefers-color-scheme:light)", selector: ':root:not([data-theme="dark"])' };
const LIGHT_BY_CHOICE = ':root[data-theme="light"]';
// An @media prelude (squashed) that holds only when `feature` does: the feature joined to others
// by "and" alone, with no "or", no comma list and no "not".
const motionMedia = (entry, feature) => {
  if (!entry.startsWith("@media")) return false;
  const body = entry.slice("@media".length);
  if (body.includes(",") || body.includes(")or(") || body.startsWith("not")) return false;
  return body.split(/and(?=\()/).includes(`(prefers-reduced-motion:${feature})`);
};
const motionAllowed = (rule) => rule.context.some((entry) => motionMedia(entry, "no-preference"));
const PAUSED = ':root[data-motion="paused"]';

// CSS Color 4 named colours.
const NAMED_COLOURS = new Set(
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(" "),
);
// CSS Color 4 system colours, which the browser picks, not the palette.
const SYSTEM_COLOURS = new Set("accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field fieldtext graytext highlight highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext".split(" "));
const COLOUR_PROPERTY = /^(--|color$|background|border|outline|box-shadow$|text-shadow$|text-decoration|caret-color$|accent-color$|fill$|stroke$|column-rule|(backdrop-)?filter$|-webkit-text-|scrollbar-color$|.*-color$)/;
const unprefixed = (property) => property.replace(/^-(webkit|moz|ms|o)-/, "");

// --- parsing ------------------------------------------------------------------------------------

const skipString = (text, start) => {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length && text[index] !== quote) index += text[index] === "\\" ? 2 : 1;
  return index + 1;
};
// The index of the "}" that closes the "{" at `open`, or the end of the text.
const closing = (text, open) => {
  let depth = 0;
  for (let index = open; index < text.length; ) {
    const character = text[index];
    if (character === '"' || character === "'") {
      index = skipString(text, index);
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}" && --depth === 0) return index;
    index += 1;
  }
  return text.length;
};
const hasBlock = (text) => {
  for (let index = 0; index < text.length; ) {
    if (text[index] === '"' || text[index] === "'") index = skipString(text, index);
    else if (text[index] === "{") return true;
    else index += 1;
  }
  return false;
};
// Splits at `separator` outside strings and brackets.
const splitTop = (text, separator) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; ) {
    const character = text[index];
    if (character === '"' || character === "'") {
      index = skipString(text, index);
      continue;
    }
    if (character === "(" || character === "[") depth += 1;
    if (character === ")" || character === "]") depth -= 1;
    if (character === separator && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
    index += 1;
  }
  parts.push(text.slice(start));
  return parts;
};
// A prelude or selector compared as written, without its whitespace and with one kind of quote.
export const squash = (text) => text.replace(/\s+/g, "").replaceAll("'", '"').toLowerCase();
// A selector as the browser matches it: case and the space that is a descendant combinator kept,
// whitespace collapsed and dropped around > + ~ only outside strings, one kind of quote. So
// ".a .b" and ".a.b", or "paused" and "Paused " in an attribute value, stay different.
export const exact = (selector) =>
  selector
    .trim()
    .split(/("[^"]*"|'[^']*')/)
    .map((part, index) => (index % 2 ? `"${part.slice(1, -1)}"` : part.replace(/\s+/g, " ").replace(/ ?([>+~]) ?/g, "$1")))
    .join("");

// Every rule of a stylesheet: its selector (or @font-face, or a keyframe step), its declarations,
// and the at-rules it sits inside, outermost first, squashed. A ";" among rules that ends no
// at-rule is marked as a stray: the browser reads it into the next rule's selector, which drops
// that rule.
export function parseCss(source) {
  const rules = [];
  const walk = (text, context, amongRules = true) => {
    let start = 0;
    for (let index = 0; index < text.length; ) {
      const character = text[index];
      if (character === '"' || character === "'") {
        index = skipString(text, index);
        continue;
      }
      if (character === ";") {
        const statement = text.slice(start, index).trim();
        if (amongRules && !statement.startsWith("@")) rules.push({ selector: statement.replace(/\s+/g, " "), declarations: [], context, stray: true });
        start = index + 1;
      }
      if (character === "{") {
        const prelude = text.slice(start, index).trim();
        const end = closing(text, index);
        const body = text.slice(index + 1, end);
        if (hasBlock(body)) {
          if (!prelude.startsWith("@")) rules.push({ selector: prelude.replace(/\s+/g, " "), declarations: [], context, nested: true });
          walk(body, [...context, squash(prelude)], prelude.startsWith("@"));
        } else {
          const declarations = splitTop(body, ";")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
              const colon = part.indexOf(":");
              const property = (colon < 0 ? part : part.slice(0, colon)).trim().toLowerCase();
              const raw = colon < 0 ? "" : part.slice(colon + 1);
              const important = /!\s*important\s*$/i.test(raw);
              return { property, value: raw.replace(/!\s*important\s*$/i, "").trim(), important };
            });
          rules.push({ selector: prelude.replace(/\s+/g, " "), declarations, context });
        }
        index = end + 1;
        start = index;
        continue;
      }
      index += 1;
    }
  };
  walk(stripComments(source), []);
  return rules;
}

// Comments out, strings kept: a "/*" inside a string does not start one.
function stripComments(text) {
  let out = "";
  for (let index = 0; index < text.length; ) {
    if (text[index] === '"' || text[index] === "'") {
      const end = skipString(text, index);
      out += text.slice(index, end);
      index = end;
    } else if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      index = end < 0 ? text.length : end + 2;
      out += " ";
    } else out += text[index++];
  }
  return out;
}

// A style rule nested in another, and an !important on a token, which this guard does not read.
export function syntaxProblems(rules, label) {
  const problems = [];
  for (const rule of rules) {
    if (rule.nested) problems.push(`${label} ${rule.selector} nests rules inside a style rule; these rules read flat CSS, so write the nested rules out on their own.`);
    if (rule.stray) problems.push(`${label} has a ";" that ends no at-rule${rule.selector ? ` (after ${rule.selector})` : ""}; the browser reads it into the next rule's selector and drops that rule, which these rules would read as applied.`);
    for (const { property, important } of rule.declarations) {
      if (important && property.startsWith("--")) problems.push(`${label} ${rule.selector} { ${property} } is !important, which outranks both light declarations; a token takes its value from the theme blocks alone.`);
    }
  }
  return problems;
}

// Shapes the browser reads otherwise than these rules do, refused rather than guessed at: a string
// broken by a line break (the browser ends the string there and reads what follows as rules), a
// url( without quotes (the browser reads it to its ")", a "/*" or a quote included), brackets
// that do not pair up (the browser closes each block at its own pair), and the <!-- and -->
// markers, which the browser skips where these rules would read them into a selector.
export function readingProblems(css, label) {
  const problems = [];
  const text = stripComments(css);
  let blank = "";
  let broken = false;
  for (let index = 0; index < text.length; ) {
    if (text[index] === '"' || text[index] === "'") {
      const end = skipString(text, index);
      broken ||= /[\n\r\f]/.test(text.slice(index, end));
      blank += '""';
      index = end;
    } else blank += text[index++];
  }
  if (broken) problems.push(`${label} has a string that runs across a line break; the browser ends a string at the break and reads what follows as rules, so keep each string on one line.`);
  if (/\burl\((?!\s*["'])/i.test(blank)) problems.push(`${label} writes url( without quotes; the browser reads a plain url( to its ")", a "/*" or a quote included, so write the address in quotes: url("…").`);
  if (/<!--|-->/.test(blank)) problems.push(`${label} holds <!-- or -->; the browser skips these markers where these rules would read them into a selector, so leave them out.`);
  const open = [];
  const paired = [...blank].every((character) => {
    if ("([{".includes(character)) open.push(character);
    else if (")]}".includes(character)) return open.pop() === "([{"[")]}".indexOf(character)];
    return true;
  });
  if (!paired || open.length) problems.push(`${label} has brackets that do not pair up; the browser closes each block at its own pair, so the rules it applies are not the ones read here.`);
  return problems;
}

// An @font-face that names a descriptor twice: the browser takes the last, so one place says what
// the face loads.
export function fontFaceProblems(rules, label) {
  const problems = [];
  for (const rule of rules.filter(({ selector }) => squash(selector) === "@font-face")) {
    const seen = new Set();
    for (const { property } of rule.declarations) {
      if (seen.has(property)) problems.push(`${label} @font-face declares ${property} twice; the browser takes the last, so each descriptor is written once.`);
      seen.add(property);
    }
  }
  return problems;
}

// A declaration that fetches: url(), image-set() or src() outside a string. An @font-face's src is
// read entry by entry instead (fontFaces).
const FETCH = /\b(url|image-set|-webkit-image-set|src)\(/i;
const fetchOf = (value) => value.replace(/"[^"]*"|'[^']*'/g, '""').match(FETCH)?.[1];
function fetchProblems(rules, label, only) {
  const problems = [];
  for (const rule of rules) {
    for (const { property, value } of rule.declarations) {
      if (squash(rule.selector) === "@font-face" && property === "src") continue;
      const fetches = fetchOf(value);
      if (fetches) problems.push(`${label} ${rule.selector} { ${property} } fetches with ${fetches}(); ${only}`);
    }
  }
  return problems;
}

const selectorsOf = (rule) => splitTop(rule.selector, ",").map(squash).filter(Boolean);
const exactSelectorsOf = (rule) => splitTop(rule.selector, ",").map(exact).filter(Boolean);
const tokensOf = (rule) => new Map(rule.declarations.filter(({ property }) => property.startsWith("--") || property === "color-scheme").map(({ property, value }) => [property, value]));

// --- colours ------------------------------------------------------------------------------------

const hex = (rgb) => `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const fromHex = (value) => {
  let digits = value.slice(1);
  if (digits.length === 3 || digits.length === 4) digits = [...digits].map((digit) => digit + digit).join("");
  return { rgb: [0, 2, 4].map((offset) => Number.parseInt(digits.slice(offset, offset + 2), 16)), alpha: digits.length === 8 ? Number.parseInt(digits.slice(6), 16) / 255 : 1 };
};
const fromRgbFunction = (inside) => {
  const parts = inside.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.slice(0, 3).some((part) => !/^\d+(\.\d+)?$/.test(part))) return null;
  const rgb = parts.slice(0, 3).map(Number);
  if (rgb.some((channel) => channel > 255 || !Number.isInteger(channel))) return null;
  const alphaText = parts[3] ?? "1";
  const alpha = alphaText.endsWith("%") ? Number(alphaText.slice(0, -1)) / 100 : Number(alphaText);
  return Number.isFinite(alpha) ? { rgb, alpha } : null;
};
// The colours written in one declaration value: [{ text, rgb, alpha }] for hex and rgb()/rgba(),
// and [{ text, problem }] for anything else that names a colour.
export function colourLiterals(value, property = "color") {
  const found = [];
  if (/\bdata:/i.test(value)) found.push({ text: "url(data:…)", problem: "is an inline data: image, whose colours cannot be read against the palette; serve the image as a file" });
  const bare = value.replace(/"[^"]*"|'[^']*'/g, "").replace(/url\([^)]*\)/gi, "");
  for (const [text] of bare.matchAll(/#[0-9a-f]+\b/gi)) {
    if ([4, 5, 7, 9].includes(text.length)) found.push({ text, ...fromHex(text) });
    else found.push({ text, problem: "is not a hex colour of 3, 4, 6 or 8 digits" });
  }
  for (const [text, , inside] of bare.matchAll(/\b(rgba?)\(([^)]*)\)/gi)) {
    const colour = fromRgbFunction(inside);
    found.push(colour ? { text, ...colour } : { text, problem: "is not an rgb() of three whole channels and an opacity" });
  }
  for (const [text] of bare.matchAll(/\b(hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi)) {
    found.push({ text: `${text}…)`, problem: "is a colour function whose value cannot be read against the palette; write the palette colour as hex, or rgb() with an opacity" });
  }
  for (const match of bare.matchAll(/\bcolor-mix\(/gi)) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let end = open;
    for (; end < bare.length; end += 1) {
      if (bare[end] === "(") depth += 1;
      if (bare[end] === ")" && --depth === 0) break;
    }
    const inside = bare.slice(open + 1, end).replace(/var\([^()]*\)/gi, "");
    if (/#[0-9a-f]|\brgba?\(|\b[a-z]{3,}\b/i.test(inside.replace(/^\s*in\s+[a-z-]+\s*,/i, "").replace(/\b(transparent|currentcolor)\b/gi, ""))) {
      found.push({ text: "color-mix(…)", problem: "mixes a literal colour, which paints a colour the palette does not name; color-mix() takes tokens, so the mix follows the theme" });
    }
  }
  if (COLOUR_PROPERTY.test(property) || COLOUR_PROPERTY.test(unprefixed(property))) {
    // A var() fallback still paints: only the var( --name part is set aside.
    const words = bare.replace(/var\(\s*--[\w-]+\s*,?/gi, "").replace(/#[0-9a-f]+\b/gi, "").match(/[a-z]+(?:-[a-z]+)*/gi) ?? [];
    for (const word of words) {
      if (NAMED_COLOURS.has(word.toLowerCase())) found.push({ text: word, problem: "is a named colour; write the palette colour as hex" });
      else if (SYSTEM_COLOURS.has(word.toLowerCase())) found.push({ text: word, problem: "is a system colour, which the browser picks; write the palette colour as hex" });
    }
  }
  return found;
}

const linear = (channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = (rgb) => {
  const [red, green, blue] = rgb.map(linear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
export const contrast = (first, second) => {
  const [a, b] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};
// A colour with opacity laid over an opaque one, channel by channel in sRGB, as a browser paints it.
const over = (top, bottom) => top.rgb.map((channel, index) => Math.round(top.alpha * channel + (1 - top.alpha) * bottom[index]));

// --- the stylesheet -----------------------------------------------------------------------------

// The dark theme (the bare :root) and the light theme (the dark one with the light block over it),
// as maps of token to value.
export function themesOf(rules) {
  const dark = new Map();
  for (const rule of rules) if (!rule.context.length && squash(rule.selector) === ":root") for (const [token, value] of tokensOf(rule)) dark.set(token, value);
  const light = new Map(dark);
  const chosen = rules.find((rule) => !rule.context.length && squash(rule.selector) === squash(LIGHT_BY_CHOICE));
  if (chosen) for (const [token, value] of tokensOf(chosen)) light.set(token, value);
  return { dark, light };
}

const paletteHexes = new Set(Object.values(PALETTE).flatMap((roles) => Object.values(roles)));

export function stylesheetProblems(css) {
  const problems = [];
  const rules = parseCss(css);
  problems.push(...syntaxProblems(rules, STYLESHEET));
  if (/@import\b/i.test(stripComments(css))) problems.push(`${STYLESHEET} uses @import; the stylesheet is one file and fetches no other, from this host or another.`);
  // 7. Requests: the fonts' files alone.
  if (stripComments(css).includes("\\")) problems.push(`${STYLESHEET} holds a backslash; as a CSS escape one can spell url( or @import where these rules do not see it, so the stylesheet uses none.`);
  problems.push(...readingProblems(css, STYLESHEET), ...fontFaceProblems(rules, STYLESHEET));
  problems.push(...fetchProblems(rules, STYLESHEET, "the stylesheet's only requests are its @font-face files in assets/fonts, which these rules read."));

  // 1. Palette.
  for (const rule of rules) {
    for (const { property, value } of rule.declarations) {
      for (const literal of colourLiterals(value, property)) {
        if (literal.problem) problems.push(`${STYLESHEET} ${rule.selector} { ${property} }: ${literal.text} ${literal.problem}.`);
        else if (!paletteHexes.has(hex(literal.rgb))) {
          problems.push(`${STYLESHEET} ${rule.selector} { ${property} }: ${literal.text} is ${hex(literal.rgb)}, which is not in the house palette (${[...paletteHexes].join(", ")}); every colour of the look is one of these, at any opacity.`);
        }
      }
    }
  }

  // 2. Two themes.
  const { dark, light } = themesOf(rules);
  const bySystem = rules.filter((rule) => squash(rule.selector) === squash(LIGHT_BY_SYSTEM.selector));
  const byChoice = rules.filter((rule) => squash(rule.selector) === squash(LIGHT_BY_CHOICE));
  if (!dark.size) problems.push(`${STYLESHEET} declares no tokens on a bare :root; the dark theme is the :root block outside any @media.`);
  if (bySystem.length !== 1 || bySystem[0].context.join(" ") !== LIGHT_BY_SYSTEM.context) {
    problems.push(`${STYLESHEET} must declare the light theme for a light system exactly once, as ${LIGHT_BY_SYSTEM.selector} directly inside @media (prefers-color-scheme: light), so a visitor whose system is light sees it until they choose dark on the switch.`);
  }
  if (byChoice.length !== 1 || byChoice[0].context.length) {
    problems.push(`${STYLESHEET} must declare the light theme for a visitor who chose it exactly once, as ${LIGHT_BY_CHOICE} outside any @media, so the switch works whatever the system says.`);
  }
  if (bySystem.length === 1 && byChoice.length === 1) {
    const system = tokensOf(bySystem[0]);
    const choice = tokensOf(byChoice[0]);
    for (const token of new Set([...system.keys(), ...choice.keys()])) {
      if (squash(system.get(token) ?? "(not declared)") !== squash(choice.get(token) ?? "(not declared)")) {
        problems.push(`${STYLESHEET} light theme: ${token} is ${system.get(token) ?? "not declared"} for a light system and ${choice.get(token) ?? "not declared"} for a visitor who chose light; the two declarations of the light theme say the same thing.`);
      }
    }
    for (const [token, value] of dark) {
      if (token === "color-scheme" || colourLiterals(value, token).length) {
        if (!choice.has(token)) problems.push(`${STYLESHEET} light theme does not re-declare ${token} (${value} in the dark theme), so it stays dark on the light page.`);
      }
    }
    for (const token of choice.keys()) {
      if (!dark.has(token)) problems.push(`${STYLESHEET} light theme declares ${token}, which the dark :root does not; a token exists in both themes or in neither.`);
    }
  }
  const specimens = rules.filter((candidate) => selectorsOf(candidate).some((selector) => selector === ".specimen" || selector === ".cmd"));
  // A theme token declared anywhere else paints what neither theme nor the contrast floors read.
  const themeBlocks = new Set([...bySystem, ...byChoice, ...specimens.filter((rule) => !rule.context.length && selectorsOf(rule).every((selector) => selector === ".specimen" || selector === ".cmd"))]);
  for (const rule of rules) {
    if (themeBlocks.has(rule) || (!rule.context.length && squash(rule.selector) === ":root")) continue;
    for (const { property } of rule.declarations) {
      if (!property.startsWith("--") || !dark.has(property)) continue;
      const where = rule.context.length ? ` (inside ${rule.context.join(" ")})` : "";
      problems.push(`${STYLESHEET} ${rule.selector}${where} declares ${property}, a theme token, outside the dark :root, the two light declarations and the specimen rule; the themes and their contrast are read from those alone.`);
    }
  }
  if (!specimens.length) problems.push(`${STYLESHEET} declares no .specimen or .cmd rule, so a terminal shown on the page would turn light with the page.`);
  for (const rule of specimens) {
    const own = tokensOf(rule);
    for (const [token, value] of own) {
      if (squash(value) !== squash(dark.get(token) ?? "")) {
        problems.push(`${STYLESHEET} ${rule.selector}: a specimen re-declares ${token} as ${value}, but the dark theme's value is ${dark.get(token) ?? "not declared"}; a terminal shown on the page keeps the dark theme in either theme.`);
      }
    }
    // Every colour token, including one built from others with var() or color-mix(): such a token
    // is resolved where it is declared, so the :root one keeps the light value inside a specimen.
    for (const [token, value] of dark) {
      if (token.startsWith("--") && (colourLiterals(value, token).length || /var\(|color-mix\(/i.test(value)) && !own.has(token)) {
        problems.push(`${STYLESHEET} ${rule.selector} does not re-declare ${token} (${value}), so inside a specimen it takes the light theme's value on the light page.`);
      }
    }
  }

  // 3. Contrast.
  for (const [name, tokens] of Object.entries({ dark, light })) {
    const solid = (token, seen = new Set()) => {
      const value = tokens.get(`--${token}`);
      const reference = value?.match(/^var\(\s*--([\w-]+)\s*\)$/);
      if (reference) return seen.has(reference[1]) ? null : solid(reference[1], new Set([...seen, token]));
      const [literal] = value ? colourLiterals(value, `--${token}`) : [];
      return literal && !literal.problem ? literal : null;
    };
    const paint = (token) => {
      const layered = token.match(/^(\S+) over (\S+)$/);
      if (!layered) {
        const colour = solid(token);
        return colour && colour.alpha === 1 ? colour.rgb : null;
      }
      const [top, bottom] = [solid(layered[1]), solid(layered[2])];
      return top && bottom && bottom.alpha === 1 ? over(top, bottom.rgb) : null;
    };
    for (const [foreground, background, floor, where] of CONTRAST_PAIRS) {
      const [front, back] = [paint(foreground), paint(background)];
      if (!front || !back) {
        problems.push(`${STYLESHEET} ${name} theme: cannot read --${foreground} on --${background} (${where}) as opaque palette colours, so its contrast cannot be held to ${floor}:1.`);
        continue;
      }
      const ratio = contrast(front, back);
      if (ratio < floor) problems.push(`${STYLESHEET} ${name} theme: --${foreground} ${hex(front)} on --${background} ${hex(back)} is ${ratio.toFixed(2)}:1, below the ${floor}:1 floor for ${where}.`);
    }
    // A page's wash (white or black, at most 5% opaque) over a surface keeps text at its floor;
    // contrast moves one way as the wash thickens, so its thickest is the one to measure.
    for (const text of TEXT_TOKENS) {
      for (const surface of SURFACES) {
        const [front, back] = [paint(text), paint(surface)];
        for (const wash of ["#FFFFFF", "#000000"]) {
          const ratio = front && back ? contrast(front, over({ rgb: fromHex(wash).rgb, alpha: WASH_ALPHA }, back)) : 0;
          if (front && back && ratio < 4.5) problems.push(`${STYLESHEET} ${name} theme: --${text} on --${surface} under a ${WASH_ALPHA * 100}% ${wash} wash is ${ratio.toFixed(2)}:1, below the 4.5:1 floor for text; a page's washes are held to it.`);
        }
      }
    }
  }
  problems.push(...emberTextProblems(rules, STYLESHEET), ...paintProblems(rules, STYLESHEET), ...dimProblems(rules, STYLESHEET));
  for (const rule of rules) {
    for (const { property, value } of rule.declarations) {
      if (!["color", "-webkit-text-fill-color"].includes(property) || /var\(\s*--ember\s*[,)]/i.test(value)) continue;
      if (!heldText(rule, value)) {
        problems.push(`${STYLESHEET} ${rule.selector} { ${property}: ${value} }: text takes --ink, --mute, --faint or --accent (or --ground on an ink or violet fill), the tokens whose contrast is held in both themes.`);
      }
    }
  }

  // 4. Motion, and the pause.
  problems.push(...motionProblems(rules, STYLESHEET));
  const pauses = (selector) => rules.some((rule) => !rule.context.length && exactSelectorsOf(rule).includes(selector) && rule.declarations.some(({ property, value, important }) => property === "animation-play-state" && /^paused$/i.test(value) && important));
  if (![PAUSED, `${PAUSED} *`, `${PAUSED} *::before`, `${PAUSED} *::after`].every(pauses)) {
    problems.push(`${STYLESHEET} must pause every animation while the page's motion switch is off: ${PAUSED}, ${PAUSED} *, *::before and *::after { animation-play-state: paused !important; } outside any @media.`);
  }
  return problems;
}

// Text is painted by its colour alone: no `all`, which resets the colour to the browser's own, and
// no background clipped to the text or stroke around it, which paint it with colours these rules
// do not hold as text. --ground is text only on an ink or violet fill set in the same rule.
const TEXT_VALUE = /^(var\(\s*--(ink|mute|faint|accent)\s*\)|currentcolor|inherit)$/i;
const onFill = (rule) => rule.declarations.some(({ property, value }) => ["background", "background-color"].includes(property) && /^var\(\s*--(ink|accent)\s*\)$/i.test(value.trim()));
const heldText = (rule, value) => TEXT_VALUE.test(value.trim()) || (/^var\(\s*--ground\s*\)$/i.test(value.trim()) && onFill(rule));
export function paintProblems(rules, label) {
  const problems = [];
  for (const rule of rules) {
    for (const { property, value } of rule.declarations) {
      if (property === "all" || (/^(-webkit-)?background-clip$/.test(property) && /\btext\b/i.test(value)) || property.startsWith("-webkit-text-stroke")) {
        problems.push(`${label} ${rule.selector} { ${property}: ${value} } paints text with something other than its colour; text takes its colour from the text tokens alone.`);
      }
    }
    if (squash(rule.selector).startsWith("@property")) problems.push(`${label} registers a property (${rule.selector}); a registered property can stop inheriting, so a theme token would not reach the elements under its theme block. Tokens are plain custom properties.`);
  }
  return problems;
}

// What dims or recolours the element it is set on, text included: opacity below 1, a filter or a
// backdrop filter, a blend mode. Set only on marks that hold no text: a ::before or ::after, an
// image, or an element inside one of MARKS (the lights, a theme card's dots, its caret, the
// directory badge, which is an image). An animation's frames are not read here.
export const MARKS = [".lights", ".dots", ".caret", ".directory-badge"];
const dims = (property, value) =>
  (property === "opacity" && !/^(1(\.0*)?|100%)$/.test(value.trim())) ||
  (/^(-webkit-)?(backdrop-)?filter$/.test(property) && !/^none$/i.test(value.trim())) ||
  (property === "mix-blend-mode" && !/^normal$/i.test(value.trim()));
const onMarks = (rule) => pathsOf(rule).every((selector) => /::(before|after)$/i.test(selector) || /(^|[\s>+~])img(?![\w-])[^\s>+~]*$/i.test(selector)) || inside(rule, ROOTS(MARKS));
export function dimProblems(rules, label) {
  return rules
    .filter((rule) => !rule.context.some((entry) => entry.startsWith("@keyframes")) && !onMarks(rule))
    .flatMap((rule) =>
      rule.declarations
        .filter(({ property, value }) => dims(property, value))
        .map(({ property, value }) => `${label} ${rule.selector} { ${property}: ${value} } dims or recolours what it is set on, which may be text held at full strength; set it only on a ::before or ::after, an image or a mark (${MARKS.join(", ")}).`),
    );
}

export function emberTextProblems(rules, label) {
  return rules.flatMap((rule) =>
    rule.declarations
      .filter(({ property, value }) => ["color", "-webkit-text-fill-color"].includes(property) && /var\(\s*--ember\s*[,)]/i.test(value))
      .map(({ property }) => `${label} ${rule.selector} { ${property}: var(--ember) }: ember is a point, never text; it is held to the 3:1 floor for marks, and fails the 4.5:1 text floor on the light theme. Colour text with --ink, --mute or --accent.`),
  );
}

// 4. Every animation, every transition of movement, smooth scrolling, view transitions and every
// transform on :hover runs only when motion is allowed; an animation, a transition or smooth
// scrolling may instead be turned off by a later rule for the same selector at the top of
// @media (prefers-reduced-motion: reduce).
const TIMING = /^(\d*\.?\d+m?s|ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|steps\(.*\)|cubic-bezier\(.*\)|linear\(.*\)|normal|allow-discrete)$/i;
// What a transition may change without moving anything: colours, opacity, shadows and filters.
// Everything else (a transform, an offset, a margin, a size, a background's position, all) moves.
const STILL = /^(none|initial|color|.+-color|opacity|fill|stroke|visibility)$/;
// The properties a transition list animates, unprefixed; a shorthand part that names none animates all.
const transitioned = (property, value) =>
  splitTop(value, ",").map((part) => {
    const words = part.trim().split(/\s+(?![^(]*\))/).filter(Boolean);
    const named = property === "transition-property" ? words[0] : words.find((word) => !TIMING.test(word));
    return unprefixed(named?.toLowerCase() ?? "all");
  });
const motionOf = (property, value, rule) => {
  const name = unprefixed(property);
  if (["animation", "animation-name"].includes(name)) return splitTop(value, ",").every((part) => /^none(\s|$)/i.test(part.trim())) ? null : "animation";
  if (["transition", "transition-property"].includes(name)) return transitioned(name, value).some((moved) => !STILL.test(moved)) ? "transition" : null;
  if (name === "scroll-behavior") return /^smooth$/i.test(value) ? "scroll-behavior" : null;
  if (squash(rule.selector) === "@view-transition") return name === "navigation" && !/^none$/i.test(value) ? "view-transition" : null;
  if (["transform", "translate", "rotate", "scale"].includes(name)) return !/^none$/i.test(value) && selectorsOf(rule).some((selector) => selector.includes(":hover")) ? "hover" : null;
  return null;
};
const stillOf = (property, value) => {
  const name = unprefixed(property);
  if (["animation", "animation-name"].includes(name) && /^none$/i.test(value.trim())) return "animation";
  if (["transition", "transition-property"].includes(name) && /^none$/i.test(value.trim())) return "transition";
  if (name === "scroll-behavior" && /^auto$/i.test(value.trim())) return "scroll-behavior";
  return null;
};
export function motionProblems(rules, label) {
  const problems = [];
  // selector -> kind -> the last rule index that turns it off
  const off = new Map();
  rules.forEach((rule, index) => {
    if (rule.context.length !== 1 || !motionMedia(rule.context[0], "reduce")) return;
    for (const { property, value } of rule.declarations) {
      const kind = stillOf(property, value);
      if (!kind) continue;
      for (const selector of exactSelectorsOf(rule)) off.set(selector, { ...off.get(selector), [kind]: index });
    }
  });
  rules.forEach((rule, index) => {
    if (motionAllowed(rule) || rule.context.some((at) => at.startsWith("@keyframes"))) return;
    for (const { property, value } of rule.declarations) {
      const kind = motionOf(property, value, rule);
      if (!kind) continue;
      const escapes = ["animation", "transition", "scroll-behavior"].includes(kind);
      const unguarded = exactSelectorsOf(rule).filter((selector) => !(escapes && (off.get(selector)?.[kind] ?? -1) > index));
      if (!unguarded.length) continue;
      problems.push(`${label} ${rule.selector} { ${property}: ${value} } runs whatever the visitor's motion setting; put it inside @media (prefers-reduced-motion: no-preference)${escapes ? ", or turn it off for the same selector in a later rule inside @media (prefers-reduced-motion: reduce)" : ""}.`);
    }
  });
  problems.push(...pauseProblems(rules, label));
  return problems;
}

// The pause holds a looping animation where it is. Anything else that moves, wherever it runs
// while motion is allowed, would hold a half-finished frame (a one-off animation, paused before it
// starts, stays on its first) or still answer the pointer, so it is written under PAUSE_GATE and
// the pause removes it. And nothing that moves is !important, which would outrank the pause and
// the rules that turn motion off; only the pause itself is.
const PAUSE_GATE = ':root:not([data-motion="paused"])';
const MOTION_PROPERTY = /^(animation|transition)(-|$)|^(transform|translate|rotate|scale|scroll-behavior)$/;
// Every animation the rule sets loops: each part of its animation list and of its iteration count
// says infinite, in so many words (a var() could say anything). A count set in another rule is
// read on its own, below.
const infinite = (part) => !/var\(/i.test(part) && /(^|\s)infinite(\s|$)/i.test(part.trim());
const loops = (rule) => {
  const parts = (name) => rule.declarations.filter(({ property }) => unprefixed(property) === name).flatMap(({ value }) => splitTop(value, ","));
  const [listed, counted] = [parts("animation"), parts("animation-iteration-count")];
  return listed.length + counted.length > 0 && [...listed, ...counted].every(infinite);
};
const gated = (rule) => exactSelectorsOf(rule).every((selector) => selector.startsWith(PAUSE_GATE));
function pauseProblems(rules, label) {
  const problems = [];
  for (const rule of rules) {
    if (rule.context.some((at) => at.startsWith("@keyframes"))) continue;
    for (const { property, value, important } of rule.declarations) {
      const name = unprefixed(property);
      if (important && MOTION_PROPERTY.test(name) && !(name === "animation-play-state" && /^paused$/i.test(value.trim()) && exactSelectorsOf(rule).every((selector) => selector.startsWith(PAUSED)))) {
        problems.push(`${label} ${rule.selector} { ${property} } is !important, which outranks the pause and the rules that turn motion off; only the pause itself is !important.`);
      }
      if (rule.context.some((at) => motionMedia(at, "reduce"))) continue;
      // A count of its own turns a loop written elsewhere into a one-off.
      if (name === "animation-iteration-count" && !splitTop(value, ",").every(infinite) && !gated(rule)) {
        problems.push(`${label} ${rule.selector} { ${property}: ${value} } counts an animation's runs outside the pause gate; a loop counted down is a one-off, which keeps its first frame while the visitor has paused motion. Write it under ${PAUSE_GATE} so the pause removes it.`);
        continue;
      }
      const kind = motionOf(property, value, rule);
      if (!kind || kind === "view-transition" || (kind === "animation" && loops(rule))) continue;
      if (gated(rule)) continue;
      problems.push(
        kind === "animation"
          ? `${label} ${rule.selector} { ${property}: ${value} } keeps its first frame while the visitor has paused motion: the pause holds every animation where it is, and this one-off has not started; write it under ${PAUSE_GATE} so the pause removes it.`
          : `${label} ${rule.selector} { ${property}: ${value} } still moves while the visitor has paused motion; write it under ${PAUSE_GATE} so the pause removes it.`,
      );
    }
  }
  return problems;
}

// --- the pages ----------------------------------------------------------------------------------

// Character references in an attribute, decoded as a browser decodes them: numeric ones, and the
// named ones that spell a URL's punctuation. Any other named one is left as written, and an
// address that still holds one is not read as this site's (crossOrigin).
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", sol: "/", bsol: "\\", colon: ":", period: ".", NewLine: "\n", Tab: "\t", num: "#", quest: "?", percnt: "%", commat: "@", equals: "=" };
const decode = (text) =>
  text
    .replace(/&#x([0-9a-f]+);?/gi, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#(\d+);?/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&([A-Za-z]+);/g, (whole, name) => NAMED[name] ?? whole);
// The page as the browser's HTML tokenizer reads it (scripts/html-tags.mjs, the reader verify.mjs
// holds every page to): each start and end tag in order, with its attributes decoded, the first of
// a repeated one kept as the browser keeps it, and the text a <style> or <script> holds.
const elementsOf = (html) =>
  htmlTags(html).map((tag) => {
    const attributes = new Map();
    for (const { name, value } of tag.attributes) if (!attributes.has(name)) attributes.set(name, decode(value));
    return { ...tag, index: tag.start, attributes, written: tag.attributes };
  });
const styleElements = (html) => elementsOf(html).filter(({ name, closing }) => name === "style" && !closing);
// A type a browser applies as CSS: none, or text/css.
const CSS_TYPE = /^\s*(text\/css)?\s*$/i;
const classesOf = (element) => (element.attributes.get("class") ?? "").split(/\s+/);
// A link on the page as a path from the repository root.
const fromPage = (href, path) => new URL(href, `https://site/${path}`).pathname.slice(1);

// Inside a specimen: the element a selector names is the specimen or sits inside it. What a
// :not(), :is(), :where() or :has() holds, an attribute value or a string names no element on
// that path, so those are set aside first; and a sibling combinator (+ or ~) straight after the
// specimen leaves it, while one after a step down into it stays inside.
const functional = (selector) => {
  let out = "";
  for (let index = 0; index < selector.length; ) {
    const call = selector.slice(index).match(/^:[\w-]+\(/);
    if (!call) {
      out += selector[index++];
      continue;
    }
    let depth = 0;
    let end = index + call[0].length - 1;
    for (; end < selector.length; end += 1) {
      if (selector[end] === "(") depth += 1;
      if (selector[end] === ")" && --depth === 0) break;
    }
    index = end + 1;
  }
  return out;
};
const specimenPath = (selector) => functional(selector.replace(/"[^"]*"|'[^']*'/g, "").replace(/\[[^\]]*\]/g, ""));
const ROOTS = (classes) => new RegExp(`\\.(${classes.map((name) => name.slice(1)).join("|")})(?![\\w-])`);
const SPECIMENS = ROOTS([".cmd", ".specimen"]);
const SPECIMENS_OR_PREVIEWS = ROOTS([".cmd", ".specimen", ...THEME_PREVIEWS]);
// Selectors with their whitespace kept, since a descendant combinator is a space.
const pathsOf = (rule) => splitTop(rule.selector, ",").map((selector) => selector.trim().replace(/\s+/g, " ")).filter(Boolean);
const inside = (rule, roots) => pathsOf(rule).every((selector) => {
  const steps = specimenPath(selector).trim().split(/\s*([>+~ ])\s*/);
  return steps.some((compound, at) => at % 2 === 0 && roots.test(compound) && (at === steps.length - 1 || /[> ]/.test(steps[at + 1])));
});
// Tokens a page may re-declare inside a specimen, and what holds them instead.
const SPECIMEN_OWN = new Set(["--ink"]);
const NOT_TEXT = ["ground-2", "raise", "hair", "accent-soft", "accent-dim", "ember-soft"];
// A wash a page may lay over a surface: white or black, at most WASH_ALPHA opaque, which keeps
// every text token at its floor on every surface in both themes (held in stylesheetProblems).
const WASH = /^#(FFFFFF|000000)$/;
// An address that leaves this site, resolved as a browser resolves it against a page here.
const crossOrigin = (url) => {
  if (/&[A-Za-z]+;/.test(url)) return true;
  try {
    return new URL(url, "https://site/index.html").host !== "site";
  } catch {
    return true;
  }
};
// Keys a script binds to the literal key: the literal itself, or a const/let/var holding it.
const keyNames = (script, key) => [`"${key}"`, `'${key}'`, ...[...script.matchAll(new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*["']${key}["']`, "g"))].map(([, name]) => name)];
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stores = (script, key) => keyNames(script, key).some((name) => new RegExp(`getItem\\(\\s*${escape(name)}\\s*\\)`).test(script)) && keyNames(script, key).some((name) => new RegExp(`setItem\\(\\s*${escape(name)}\\s*,`).test(script));
// The names a script binds to document.getElementById(id), or to matchMedia(query).
const bound = (script, call) => [...script.matchAll(new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:window\\.|document\\.)?${call}`, "g"))].map(([, name]) => name);
// The script shows the element bound to `id` (sets hidden to `shown`) and never hides it again.
const shows = (script, id, shown) =>
  bound(script, `getElementById\\(\\s*["']${id}["']\\s*\\)`).some(
    (name) => new RegExp(`\\b${escape(name)}\\.hidden\\s*=\\s*(${shown})\\s*[;\\n]`).test(script) && !new RegExp(`\\b${escape(name)}\\.hidden\\s*=\\s*true\\b`).test(script),
  );
// Properties a style attribute may set: a theme preview's own colours (custom properties). Text
// colour, surfaces, opacity and motion stay in the <style> these rules read.
const STYLE_ATTRIBUTE = /^--[\w-]+$/;

// `fontFiles` is what the stylesheet's @font-face rules load, as paths from the repository root;
// `tokens` is the stylesheet's own tokens (sharedTokens), which a page does not re-declare.
export function pageProblems(source, path, fontFiles = [], tokens = []) {
  const problems = [];
  const elements = elementsOf(source);
  const opened = (name) => elements.filter((element) => element.name === name && !element.closing);
  const relsOf = (link) => (link.attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
  const stylesheets = opened("link").filter((link) => relsOf(link).includes("stylesheet"));
  const sheet = stylesheets.find((link) => !relsOf(link).includes("alternate") && fromPage(link.attributes.get("href") ?? "", path) === STYLESHEET);
  for (const link of stylesheets) {
    const href = link.attributes.get("href") ?? "";
    if (link !== sheet && !crossOrigin(href)) problems.push(`${path} links ${href} as a stylesheet; its rules are not read here, so the page's styles are its own <style> and ${STYLESHEET} alone.`);
  }
  const styleTags = opened("style");
  const firstStyle = styleTags[0]?.index ?? -1;
  if (!sheet) problems.push(`${path} does not link ${STYLESHEET} (<link rel="stylesheet" href="${STYLESHEET}">), so it does not wear the site's look.`);
  else {
    if (firstStyle >= 0 && sheet.index > firstStyle) problems.push(`${path} links ${STYLESHEET} after its own <style>, so the shared tokens would override the page's layout; link it first.`);
    const media = (sheet.attributes.get("media") ?? "all").trim().toLowerCase();
    if (!["all", "screen"].includes(media) || sheet.attributes.has("disabled")) problems.push(`${path} links ${STYLESHEET} with media="${media}"${sheet.attributes.has("disabled") ? " and disabled" : ""}, so the screen does not wear the site's look; link it for all media.`);
    if (!CSS_TYPE.test(sheet.attributes.get("type") ?? "")) problems.push(`${path} links ${STYLESHEET} with type="${sheet.attributes.get("type")}", which the browser does not load as CSS; leave the type off.`);
  }
  const lit = elements.some((element, at) => {
    if (element.closing || element.name !== "div" || !classesOf(element).includes("lights") || element.attributes.get("aria-hidden") !== "true") return false;
    const end = elements.findIndex((other, after) => after > at && other.closing && other.name === "div");
    const inside = elements.slice(at + 1, end < 0 ? undefined : end);
    return ["l1", "l2", "l3"].every((name) => inside.some((other) => !other.closing && other.name === "span" && classesOf(other).includes(name)));
  });
  if (!lit) {
    problems.push(`${path} does not carry the ambient lights: <div class="lights" aria-hidden="true"> holding spans of class l1, l2 and l3.`);
  }
  const button = (id, name) => {
    const tag = opened("button").find((candidate) => candidate.attributes.get("id") === id);
    return tag && (!name || (tag.attributes.get("class") ?? "").split(/\s+/).includes(name)) && tag.attributes.get("type") === "button" && tag.attributes.has("hidden");
  };
  if (!button("themeSwitch", "theme-switch")) {
    problems.push(`${path} does not carry the theme switch as <button class="theme-switch" id="themeSwitch" type="button" hidden>; it stays hidden until the page's script can work it.`);
  }
  if (!button("motionSwitch")) {
    problems.push(`${path} does not carry the motion switch as <button id="motionSwitch" type="button" hidden>; the looping motion needs a control that pauses it (WCAG 2.2.2), shown by the script while motion is allowed.`);
  }
  const scripts = opened("script")
    .filter((script) => !script.attributes.has("src") && !/application\/ld\+json/i.test(script.attributes.get("type") ?? ""))
    .map(({ text }) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/;\s*\/\/[^\n]*/g, ";"))
    .join("\n");
  if (!stores(scripts, THEME_KEY) || !shows(scripts, "themeSwitch", "false")) {
    problems.push(`${path}'s script does not work the theme switch under the key "${THEME_KEY}" (reading it with getItem, saving it with setItem, and unhiding the switch), the key the Familiars page keeps the choice under, so a choice made on one page would not hold on the other.`);
  }
  const allowed = bound(scripts, `matchMedia\\(\\s*["']\\(\\s*prefers-reduced-motion\\s*:\\s*no-preference\\s*\\)["']\\s*\\)`).map((name) => `!\\s*${escape(name)}\\.matches`);
  if (!stores(scripts, MOTION_KEY) || !/data-motion/.test(scripts) || !shows(scripts, "motionSwitch", ["false", ...allowed].join("|"))) {
    problems.push(`${path}'s script does not work the motion switch under the key "${MOTION_KEY}" (reading it with getItem, saving it with setItem, setting data-motion on the root, and showing the switch, never hiding it again, whenever prefers-reduced-motion: no-preference matches).`);
  }
  if (/fonts\.(googleapis|gstatic)\.com/i.test(source)) problems.push(`${path} fetches a font from Google; the site serves its own fonts from assets/fonts, with no third-party request.`);
  for (const link of opened("link")) {
    const rels = (link.attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
    const href = link.attributes.get("href") ?? "";
    if (rels.some((rel) => ["stylesheet", "preload", "modulepreload", "preconnect", "dns-prefetch"].includes(rel)) && crossOrigin(href)) {
      problems.push(`${path} links ${href} (${rels.join(" ")}) from another host; the site's styles and fonts are its own files.`);
    }
  }
  for (const link of opened("link").filter((tag) => tag.attributes.get("rel") === "preload" && tag.attributes.get("as") === "font")) {
    const href = link.attributes.get("href") ?? "";
    if (!fontFiles.includes(fromPage(href, path))) problems.push(`${path} preloads the font ${href}, which no @font-face in ${STYLESHEET} loads, so the visitor downloads it for nothing.`);
    if (!link.attributes.has("crossorigin")) problems.push(`${path} preloads the font ${href} without crossorigin; fonts are fetched in CORS mode, so the browser would fetch it twice.`);
  }
  const styles = styleTags.map(({ text }) => text);
  if (styles.some((css) => /@import\b/i.test(stripComments(css)))) problems.push(`${path}'s <style> uses @import; the page's styles are its own <style> and ${STYLESHEET}.`);
  // As in the stylesheet: a CSS escape can spell a property, a selector or url( where these rules
  // do not see it, and a <style> for another medium is read here as if it applied on screen.
  if (styles.some((css) => stripComments(css).includes("\\"))) problems.push(`${path}'s <style> holds a backslash; as a CSS escape one can spell a property, a selector or url( where these rules do not see it, so the page's styles use none.`);
  for (const style of styleTags) {
    const media = (style.attributes.get("media") ?? "all").trim().toLowerCase();
    if (!["all", "screen"].includes(media)) problems.push(`${path} has a <style media="${media}">; these rules read every <style> as applying on screen, so the page's styles are for every medium.`);
    if (!CSS_TYPE.test(style.attributes.get("type") ?? "")) problems.push(`${path} has a <style type="${style.attributes.get("type")}">, which the browser does not apply; these rules would read its rules as applied, so a <style> takes no type but text/css.`);
  }
  for (const css of styles) problems.push(...readingProblems(css, `${path}'s <style>`));
  if (opened("marquee").length) problems.push(`${path} carries a <marquee>, which scrolls whatever the visitor's motion setting and the pause.`);
  for (const css of styles) {
    for (const { family, raw, unread } of fontFaces(css, path)) {
      for (const url of raw) if (crossOrigin(url)) problems.push(`${path} @font-face for "${family}" loads ${url} from another host; the site serves its own fonts from assets/fonts.`);
      for (const entry of unread) problems.push(`${path} @font-face for "${family}" has a src entry these rules cannot read, ${entry}; write each as url("…") with format("…"), or local("…").`);
    }
  }
  // Every style attribute, a repeated one included, decoded as the browser decodes it.
  const styleAttributes = elements.filter(({ closing }) => !closing).flatMap(({ written }) => written.filter(({ name }) => name === "style").map(({ value }) => decode(value)));
  for (const style of styleAttributes) {
    if (style.includes("\\")) problems.push(`${path} has a style attribute that holds a backslash; as a CSS escape one can spell a property these rules do not see.`);
    problems.push(...readingProblems(style, `${path}: a style attribute`));
    const fetches = fetchOf(style);
    if (fetches) problems.push(`${path} has a style attribute that fetches with ${fetches}(); a style attribute sets only a theme preview's own colours (custom properties), and fetches nothing.`);
    for (const part of splitTop(style, ";")) {
      const property = part.slice(0, part.indexOf(":")).trim().toLowerCase();
      if (!property) continue;
      if (tokens.includes(property)) problems.push(`${path} has a style attribute that re-declares ${property}, a token of ${STYLESHEET}; the page paints with the stylesheet's tokens, whose themes and contrast are held there.`);
      else if (!STYLE_ATTRIBUTE.test(property)) problems.push(`${path} has a style attribute that sets ${property}; a style attribute sets only a theme preview's own colours (custom properties), so text colour, surfaces, opacity and motion stay in the <style> these rules read.`);
    }
  }
  const rules = styles.flatMap((css) => parseCss(css));
  // The specimen's ink as scripts/verify-contrast.mjs reads it: the first one written on the page.
  const specimenInk = source.match(/--ink\s*:\s*(#[0-9a-f]{6})\s*;/i)?.[1].toLowerCase();
  problems.push(...syntaxProblems(rules, path), ...fontFaceProblems(rules, path));
  problems.push(...fetchProblems(rules, path, "the page's styles fetch nothing but their @font-face files, read entry by entry."));
  for (const rule of rules) {
    for (const { property, value } of rule.declarations) {
      if (tokens.includes(property) && !(inside(rule, SPECIMENS) && SPECIMEN_OWN.has(property))) {
        problems.push(`${path} ${rule.selector} re-declares ${property}, a token of ${STYLESHEET}; the page paints with the stylesheet's tokens, whose themes and contrast are held there.`);
      }
      if (SPECIMEN_OWN.has(property) && value.trim().toLowerCase() !== specimenInk) {
        problems.push(`${path} ${rule.selector} { ${property}: ${value} }: scripts/verify-contrast.mjs holds the first ${property} the page declares, ${specimenInk}; a specimen's ink is that one value.`);
      }
      if (/^background(-color|-image)?$/.test(property) && !inside(rule, SPECIMENS_OR_PREVIEWS)) {
        const own = [...value.matchAll(/var\(\s*(--[\w-]+)/gi)].map(([, name]) => name).find((name) => !tokens.includes(name));
        const literal = colourLiterals(value, property).find(({ rgb, alpha, problem }) => problem || !WASH.test(hex(rgb)) || alpha > WASH_ALPHA);
        if (own || literal) problems.push(`${path} ${rule.selector} { ${property}: ${value} }: outside a specimen or a theme preview, a surface takes the shared tokens, which follow the theme and whose contrast with text is held, or a wash of white or black at most ${WASH_ALPHA * 100}% opaque; ${own ?? literal.text} is neither.`);
      }
      if (!["color", "-webkit-text-fill-color"].includes(property)) continue;
      const surface = NOT_TEXT.find((token) => new RegExp(`var\\(\\s*--${token}\\s*[,)]`, "i").test(value));
      if (surface) problems.push(`${path} ${rule.selector} { ${property}: ${value} }: --${surface} is a surface, line or wash, never text; its contrast is not held. Colour text with --ink, --mute, --faint or --accent.`);
      else if (inside(rule, SPECIMENS_OR_PREVIEWS)) {
        if (!/^(var\(\s*--[\w-]+\s*\)|currentcolor|inherit)$/i.test(value.trim())) problems.push(`${path} ${rule.selector} { ${property}: ${value} }: inside a specimen or a theme preview, text takes the specimen's or the preview's own colours, var(--…) with no fallback, not a literal.`);
      } else if (!heldText(rule, value) && !/var\(\s*--ember\s*[,)]/i.test(value)) {
        problems.push(`${path} ${rule.selector} { ${property}: ${value} }: outside a specimen or a theme preview, text takes --ink, --mute, --faint or --accent (or --ground on an ink or violet fill), the tokens whose contrast ${STYLESHEET} holds in both themes; a literal colour, the coding palette or a token of the page's own would not follow the light theme. Inside a specimen (.cmd, .specimen) or a theme preview (${THEME_PREVIEWS.join(", ")}) it takes the specimen's colours.`);
      }
    }
  }
  problems.push(...emberTextProblems(rules, path), ...paintProblems(rules, path), ...dimProblems(rules, path));
  problems.push(...motionProblems(rules, path));
  return problems;
}

// The tokens the stylesheet declares on its dark :root.
export function sharedTokens(css) {
  return [...themesOf(parseCss(css)).dark.keys()].filter((token) => token.startsWith("--"));
}

// --- fonts --------------------------------------------------------------------------------------

// One entry of an @font-face src as the browser reads it: url() holding a quoted or a plain
// address, with format() and tech() hints, or local().
const SOURCE = /^(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^"'()\s\\]+))\s*\)(?:\s+(?:format|tech)\([^()]*\))*|local\([^()]*\))$/i;
// The @font-face rules: family and the files each loads, as paths from the repository root, from
// every src it declares. `base` is the file the CSS sits in, which its relative urls resolve
// against. An entry these rules cannot read is returned as unread, never skipped.
export function fontFaces(css, base = STYLESHEET) {
  return parseCss(css)
    .filter((rule) => squash(rule.selector) === "@font-face")
    .map((rule) => {
      const all = (name) => rule.declarations.filter(({ property }) => property === name).map(({ value }) => value);
      const family = (all("font-family").at(-1) ?? "").replace(/^["']|["']$/g, "");
      const raw = [];
      const unread = [];
      for (const entry of all("src").flatMap((value) => splitTop(value, ",").map((part) => part.trim()))) {
        const match = entry.match(SOURCE);
        if (!match) unread.push(entry);
        else if (!/^local\(/i.test(entry)) raw.push((match[1] ?? match[2] ?? match[3]).trim());
      }
      const urls = raw.map((url) => new URL(url, `https://site/${base}`).pathname.slice(1));
      return { family, urls, raw, unread };
    });
}

// The files a page's own <style> loads with @font-face, as paths from the repository root.
export function pageFontFiles(html, path) {
  return styleElements(html).flatMap(({ text }) => fontFaces(text, path).flatMap(({ urls }) => urls));
}

// `files` maps each file name in assets/fonts to its text (licences) or to true (fonts);
// `pageFonts` lists the files the pages' own @font-face rules load (pageFontFiles).
export function fontProblems(css, files, pageFonts = []) {
  const problems = [];
  const faces = fontFaces(css);
  const used = new Set([...faces.flatMap(({ urls }) => urls), ...pageFonts]);
  for (const { family, urls, raw, unread } of faces) {
    if (!urls.length) problems.push(`${STYLESHEET} @font-face for "${family}" loads no file.`);
    for (const entry of unread) problems.push(`${STYLESHEET} @font-face for "${family}" has a src entry these rules cannot read, ${entry}; write each as url("…") with format("…"), or local("…").`);
    for (const [index, url] of urls.entries()) {
      if (crossOrigin(raw[index])) problems.push(`${STYLESHEET} @font-face for "${family}" loads ${raw[index]} from another host; the site serves its own fonts from assets/fonts.`);
      else if (!url.startsWith("assets/fonts/") || !(url.slice("assets/fonts/".length) in files)) problems.push(`${STYLESHEET} @font-face for "${family}" loads ${url}, which is not a file in assets/fonts.`);
    }
    const licence = `OFL-${family.replace(/\s+/g, "")}.txt`;
    const text = files[licence];
    if (typeof text !== "string" || !/SIL OPEN FONT LICENSE/i.test(text)) {
      problems.push(`assets/fonts/${licence} is missing or is not the SIL Open Font License; "${family}" is served under the OFL, which travels with the font.`);
    }
  }
  for (const name of Object.keys(files)) {
    if (/\.(ttf|otf|woff2?)$/i.test(name) && !used.has(`assets/fonts/${name}`)) problems.push(`assets/fonts/${name} is not loaded by any @font-face in ${STYLESHEET} or in a page's own <style>; remove it or use it.`);
  }
  return problems;
}
