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
//    A page's own <style> re-declares none of the stylesheet's tokens, so what the page paints with
//    is what these rules read; the one exception is the install command's plain text (--ink inside
//    .cmd), which is the shared coding palette's and is held by scripts/verify-contrast.mjs.
// 3. Contrast, in each theme, with WCAG 2.x's formula: every text token on every surface at
//    4.5:1, the floor for normal text, including over the violet wash of a selected chip; the
//    page colour on an ink fill (the primary pill's label) at 4.5:1; and the two marks that are
//    never text (the ember point, and the sun or moon on the switch's violet knob) at 3:1, the
//    floor for graphical objects. Ember is held to the lower floor because it is never text:
//    no color declaration in the stylesheet or a page's <style> uses it. Text in the stylesheet
//    takes only the text tokens; text in a page's <style> takes no surface, line or wash token,
//    and a literal colour or the coding palette only inside a specimen.
// 4. Motion only when the visitor allows it. Every animation, every transition of a transform
//    (or of all properties), smooth scrolling, view transitions and every transform on :hover, in
//    the stylesheet and in a page's own <style>, sits inside
//    @media (prefers-reduced-motion: no-preference), or, for an animation, a transition or smooth
//    scrolling, a later rule for the same selector turns it off inside
//    @media (prefers-reduced-motion: reduce). With reduced motion on, nothing moves; with it off,
//    the page offers a control that pauses every animation (WCAG 2.2.2).
// 5. The pages on the base link assets/site.css before their own <style>, so the page's layout
//    builds on the shared tokens; carry the ambient lights, the theme switch, wired to the key
//    the Familiars page keeps the choice under, so one choice holds across the site, and the
//    motion switch; preload no font the stylesheet does not use; and fetch no font or stylesheet
//    from another host.
// 6. Fonts. Every @font-face in the stylesheet points at a file in assets/fonts, every font file
//    there is loaded by an @font-face (the stylesheet's, or one in a page's own <style> that has
//    not moved onto the base yet), and every family in the stylesheet ships with its SIL Open Font
//    License, which both fonts are under.
//
// The rules read CSS as written, flat: a style rule nested inside another is refused rather than
// guessed at, and an !important on a token, which would outrank both light declarations, is too.
//
// What cannot pass is a colour the design base does not name, a light theme that differs by
// which way the visitor arrived at it, text below the floor in either theme, motion that runs
// against a visitor's setting, a page that drops the base, or a font served without its licence.

export const STYLESHEET = "assets/site.css";
export const SITE_PAGES = ["index.html"];
export const THEME_KEY = "familiars-theme";
export const MOTION_KEY = "familiars-motion";

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
const COLOUR_PROPERTY = /^(--|color$|background|border|outline|box-shadow$|text-shadow$|text-decoration|caret-color$|accent-color$|fill$|stroke$|column-rule|filter$|-webkit-text-|scrollbar-color$|.*-color$)/;

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

// Every rule of a stylesheet: its selector (or @font-face, or a keyframe step), its declarations,
// and the at-rules it sits inside, outermost first, squashed.
export function parseCss(source) {
  const rules = [];
  const walk = (text, context) => {
    let start = 0;
    for (let index = 0; index < text.length; ) {
      const character = text[index];
      if (character === '"' || character === "'") {
        index = skipString(text, index);
        continue;
      }
      if (character === ";") start = index + 1;
      if (character === "{") {
        const prelude = text.slice(start, index).trim();
        const end = closing(text, index);
        const body = text.slice(index + 1, end);
        if (hasBlock(body)) {
          if (!prelude.startsWith("@")) rules.push({ selector: prelude.replace(/\s+/g, " "), declarations: [], context, nested: true });
          walk(body, [...context, squash(prelude)]);
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
    for (const { property, important } of rule.declarations) {
      if (important && property.startsWith("--")) problems.push(`${label} ${rule.selector} { ${property} } is !important, which outranks both light declarations; a token takes its value from the theme blocks alone.`);
    }
  }
  return problems;
}

const selectorsOf = (rule) => splitTop(rule.selector, ",").map(squash).filter(Boolean);
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
  if (/url\(\s*["']?\s*data:/i.test(value)) found.push({ text: "url(data:…)", problem: "is an inline data: image, whose colours cannot be read against the palette; serve the image as a file" });
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
  if (COLOUR_PROPERTY.test(property)) {
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
  }
  problems.push(...emberTextProblems(rules, STYLESHEET));
  for (const rule of rules) {
    for (const { property, value } of rule.declarations) {
      if (!["color", "-webkit-text-fill-color"].includes(property) || /var\(\s*--ember\s*[,)]/i.test(value)) continue;
      if (!/^(var\(\s*--(ink|mute|faint|accent|ground)\s*\)|currentcolor|inherit|transparent)$/i.test(value.trim())) {
        problems.push(`${STYLESHEET} ${rule.selector} { ${property}: ${value} }: text takes --ink, --mute, --faint or --accent (or --ground on an ink or violet fill), the tokens whose contrast is held in both themes.`);
      }
    }
  }

  // 4. Motion, and the pause.
  problems.push(...motionProblems(rules, STYLESHEET));
  const pauses = (selector) => rules.some((rule) => !rule.context.length && selectorsOf(rule).includes(squash(selector)) && rule.declarations.some(({ property, value, important }) => property === "animation-play-state" && /^paused$/i.test(value) && important));
  if (![`${PAUSED} *`, `${PAUSED} *::before`, `${PAUSED} *::after`].every(pauses)) {
    problems.push(`${STYLESHEET} must pause every animation while the page's motion switch is off: ${PAUSED} *, *::before and *::after { animation-play-state: paused !important; } outside any @media.`);
  }
  return problems;
}

export function emberTextProblems(rules, label) {
  return rules.flatMap((rule) =>
    rule.declarations
      .filter(({ property, value }) => ["color", "-webkit-text-fill-color"].includes(property) && /var\(\s*--ember\s*[,)]/i.test(value))
      .map(({ property }) => `${label} ${rule.selector} { ${property}: var(--ember) }: ember is a point, never text; it is held to the 3:1 floor for marks, and fails the 4.5:1 text floor on the light theme. Colour text with --ink, --mute or --accent.`),
  );
}

// 4. Every animation, every transition of a transform, smooth scrolling, view transitions and every
// transform on :hover runs only when motion is allowed; an animation, a transition or smooth
// scrolling may instead be turned off by a later rule for the same selector at the top of
// @media (prefers-reduced-motion: reduce).
const TIMING = /^(\d*\.?\d+m?s|ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|steps\(.*\)|cubic-bezier\(.*\)|linear\(.*\)|normal|allow-discrete)$/i;
const MOVING = new Set(["all", "transform", "translate", "rotate", "scale"]);
// The properties a transition list animates; a shorthand part that names none animates all.
const transitioned = (property, value) =>
  splitTop(value, ",").map((part) => {
    const words = part.trim().split(/\s+(?![^(]*\))/).filter(Boolean);
    if (property === "transition-property") return words[0]?.toLowerCase() ?? "all";
    return words.find((word) => !TIMING.test(word))?.toLowerCase() ?? "all";
  });
const motionOf = (property, value, rule) => {
  const name = property.replace(/^-(webkit|moz|ms|o)-/, "");
  if (["animation", "animation-name"].includes(name)) return splitTop(value, ",").every((part) => /^none(\s|$)/i.test(part.trim())) ? null : "animation";
  if (["transition", "transition-property"].includes(name)) return transitioned(name, value).some((moved) => MOVING.has(moved)) ? "transition" : null;
  if (name === "scroll-behavior") return /^smooth$/i.test(value) ? "scroll-behavior" : null;
  if (squash(rule.selector) === "@view-transition") return name === "navigation" && !/^none$/i.test(value) ? "view-transition" : null;
  if (["transform", "translate", "rotate", "scale"].includes(name)) return !/^none$/i.test(value) && selectorsOf(rule).some((selector) => selector.includes(":hover")) ? "hover" : null;
  return null;
};
const stillOf = (property, value) => {
  const name = property.replace(/^-(webkit|moz|ms|o)-/, "");
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
      for (const selector of selectorsOf(rule)) off.set(selector, { ...off.get(selector), [kind]: index });
    }
  });
  rules.forEach((rule, index) => {
    if (motionAllowed(rule) || rule.context.some((at) => at.startsWith("@keyframes"))) return;
    for (const { property, value } of rule.declarations) {
      const kind = motionOf(property, value, rule);
      if (!kind) continue;
      const escapes = ["animation", "transition", "scroll-behavior"].includes(kind);
      const unguarded = selectorsOf(rule).filter((selector) => !(escapes && (off.get(selector)?.[kind] ?? -1) > index));
      if (!unguarded.length) continue;
      problems.push(`${label} ${rule.selector} { ${property}: ${value} } runs whatever the visitor's motion setting; put it inside @media (prefers-reduced-motion: no-preference)${escapes ? ", or turn it off for the same selector in a later rule inside @media (prefers-reduced-motion: reduce)" : ""}.`);
    }
  });
  return problems;
}

// --- the pages ----------------------------------------------------------------------------------

const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
const attributes = (tag) => new Map([...tag.matchAll(/([a-z-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi)].slice(1).map(([, name, value = ""]) => [name.toLowerCase(), value.replace(/^["']|["']$/g, "")]));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((match) => ({ index: match.index, attributes: attributes(match[0]) }));
// A link on the page as a path from the repository root.
const fromPage = (href, path) => new URL(href, `https://site/${path}`).pathname.slice(1);

const SPECIMEN = /\.(cmd|specimen)(?![\w-])/;
const inSpecimen = (rule) => selectorsOf(rule).every((selector) => SPECIMEN.test(selector));
// Tokens a page may re-declare inside a specimen, and what holds them instead.
const SPECIMEN_OWN = new Set(["--ink"]);
const NOT_TEXT = ["ground-2", "raise", "hair", "accent-soft", "accent-dim", "ember-soft"];
const crossOrigin = (url) => /^([a-z][a-z0-9+.-]*:)?\/\//i.test(url.trim());
// Keys a script binds to the literal key: the literal itself, or a const/let/var holding it.
const keyNames = (script, key) => [`"${key}"`, `'${key}'`, ...[...script.matchAll(new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*["']${key}["']`, "g"))].map(([, name]) => name)];
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stores = (script, key) => keyNames(script, key).some((name) => new RegExp(`getItem\\(\\s*${escape(name)}\\s*\\)`).test(script)) && keyNames(script, key).some((name) => new RegExp(`setItem\\(\\s*${escape(name)}\\s*,`).test(script));

// `fontFiles` is what the stylesheet's @font-face rules load, as paths from the repository root;
// `tokens` is the stylesheet's own tokens (sharedTokens), which a page does not re-declare.
export function pageProblems(source, path, fontFiles = [], tokens = []) {
  const problems = [];
  // Markup in a comment is not on the page.
  const html = source.replace(/<!--[\s\S]*?-->/g, "");
  const sheet = tags(html, "link").find((link) => (link.attributes.get("rel") ?? "").split(/\s+/).includes("stylesheet") && fromPage(link.attributes.get("href") ?? "", path) === STYLESHEET);
  const firstStyle = html.search(/<style\b/i);
  if (!sheet) problems.push(`${path} does not link ${STYLESHEET} (<link rel="stylesheet" href="${STYLESHEET}">), so it does not wear the site's look.`);
  else {
    if (firstStyle >= 0 && sheet.index > firstStyle) problems.push(`${path} links ${STYLESHEET} after its own <style>, so the shared tokens would override the page's layout; link it first.`);
    const media = (sheet.attributes.get("media") ?? "all").trim().toLowerCase();
    if (!["all", "screen"].includes(media) || sheet.attributes.has("disabled")) problems.push(`${path} links ${STYLESHEET} with media="${media}"${sheet.attributes.has("disabled") ? " and disabled" : ""}, so the screen does not wear the site's look; link it for all media.`);
  }
  const lights = html.match(/<div\b[^>]*\bclass\s*=\s*"[^"]*\blights\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (!lights || !/aria-hidden\s*=\s*"true"/i.test(lights[0]) || !["l1", "l2", "l3"].every((name) => new RegExp(`<span\\b[^>]*class\\s*=\\s*"[^"]*\\b${name}\\b`, "i").test(lights[1]))) {
    problems.push(`${path} does not carry the ambient lights: <div class="lights" aria-hidden="true"> holding spans of class l1, l2 and l3.`);
  }
  const button = (id, name) => {
    const tag = tags(html, "button").find((candidate) => candidate.attributes.get("id") === id);
    return tag && (!name || (tag.attributes.get("class") ?? "").split(/\s+/).includes(name)) && tag.attributes.get("type") === "button" && tag.attributes.has("hidden");
  };
  if (!button("themeSwitch", "theme-switch")) {
    problems.push(`${path} does not carry the theme switch as <button class="theme-switch" id="themeSwitch" type="button" hidden>; it stays hidden until the page's script can work it.`);
  }
  if (!button("motionSwitch")) {
    problems.push(`${path} does not carry the motion switch as <button id="motionSwitch" type="button" hidden>; the looping motion needs a control that pauses it (WCAG 2.2.2), shown by the script while motion is allowed.`);
  }
  const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .map((match) => match[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/;\s*\/\/[^\n]*/g, ";"))
    .join("\n");
  if (!/getElementById\(\s*["']themeSwitch["']\s*\)/.test(scripts) || !stores(scripts, THEME_KEY) || !/\.hidden\s*=\s*false\b/.test(scripts)) {
    problems.push(`${path}'s script does not work the theme switch under the key "${THEME_KEY}" (reading it with getItem, saving it with setItem, and unhiding the switch), the key the Familiars page keeps the choice under, so a choice made on one page would not hold on the other.`);
  }
  if (!/getElementById\(\s*["']motionSwitch["']\s*\)/.test(scripts) || !stores(scripts, MOTION_KEY) || !/data-motion/.test(scripts)) {
    problems.push(`${path}'s script does not work the motion switch under the key "${MOTION_KEY}" (reading it with getItem, saving it with setItem, and setting data-motion on the root).`);
  }
  if (/fonts\.(googleapis|gstatic)\.com/i.test(html)) problems.push(`${path} fetches a font from Google; the site serves its own fonts from assets/fonts, with no third-party request.`);
  for (const link of tags(html, "link")) {
    const rels = (link.attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
    const href = link.attributes.get("href") ?? "";
    if (rels.some((rel) => ["stylesheet", "preload", "modulepreload", "preconnect", "dns-prefetch"].includes(rel)) && crossOrigin(href)) {
      problems.push(`${path} links ${href} (${rels.join(" ")}) from another host; the site's styles and fonts are its own files.`);
    }
  }
  for (const link of tags(html, "link").filter((tag) => tag.attributes.get("rel") === "preload" && tag.attributes.get("as") === "font")) {
    const href = link.attributes.get("href") ?? "";
    if (!fontFiles.includes(fromPage(href, path))) problems.push(`${path} preloads the font ${href}, which no @font-face in ${STYLESHEET} loads, so the visitor downloads it for nothing.`);
    if (!link.attributes.has("crossorigin")) problems.push(`${path} preloads the font ${href} without crossorigin; fonts are fetched in CORS mode, so the browser would fetch it twice.`);
  }
  const styles = [...html.matchAll(STYLE_BLOCK)].map((match) => match[1]);
  if (styles.some((css) => /@import\b/i.test(stripComments(css)))) problems.push(`${path}'s <style> uses @import; the page's styles are its own <style> and ${STYLESHEET}.`);
  for (const css of styles) {
    for (const { family, raw } of fontFaces(css, path)) {
      for (const url of raw) if (crossOrigin(url)) problems.push(`${path} @font-face for "${family}" loads ${url} from another host; the site serves its own fonts from assets/fonts.`);
    }
  }
  const rules = styles.flatMap((css) => parseCss(css));
  problems.push(...syntaxProblems(rules, path));
  for (const rule of rules) {
    for (const { property, value } of rule.declarations) {
      if (tokens.includes(property) && !(inSpecimen(rule) && SPECIMEN_OWN.has(property))) {
        problems.push(`${path} ${rule.selector} re-declares ${property}, a token of ${STYLESHEET}; the page paints with the stylesheet's tokens, whose themes and contrast are held there.`);
      }
      if (!["color", "-webkit-text-fill-color"].includes(property)) continue;
      const surface = NOT_TEXT.find((token) => new RegExp(`var\\(\\s*--${token}\\s*[,)]`, "i").test(value));
      if (surface) problems.push(`${path} ${rule.selector} { ${property}: ${value} }: --${surface} is a surface, line or wash, never text; its contrast is not held. Colour text with --ink, --mute, --faint or --accent.`);
      else if (!inSpecimen(rule) && (colourLiterals(value, property).length || /var\(\s*--syntax-/i.test(value))) {
        problems.push(`${path} ${rule.selector} { ${property}: ${value} }: a literal colour or the coding palette is text only inside a specimen (.cmd or .specimen), whose surface stays dark; on the page it would not follow the light theme.`);
      }
    }
  }
  problems.push(...emberTextProblems(rules, path));
  problems.push(...motionProblems(rules, path));
  return problems;
}

// The tokens the stylesheet declares on its dark :root.
export function sharedTokens(css) {
  return [...themesOf(parseCss(css)).dark.keys()].filter((token) => token.startsWith("--"));
}

// --- fonts --------------------------------------------------------------------------------------

// The @font-face rules: family and the file each loads, as a path from the repository root.
// `base` is the file the CSS sits in, which its relative urls resolve against.
export function fontFaces(css, base = STYLESHEET) {
  return parseCss(css)
    .filter((rule) => squash(rule.selector) === "@font-face")
    .map((rule) => {
      const get = (name) => rule.declarations.find(({ property }) => property === name)?.value ?? "";
      const family = get("font-family").replace(/^["']|["']$/g, "");
      const raw = [...get("src").matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map(([, url]) => url.trim());
      const urls = raw.map((url) => new URL(url, `https://site/${base}`).pathname.slice(1));
      return { family, urls, raw };
    });
}

// The files a page's own <style> loads with @font-face, as paths from the repository root.
export function pageFontFiles(html, path) {
  return [...html.matchAll(STYLE_BLOCK)].flatMap((match) => fontFaces(match[1], path).flatMap(({ urls }) => urls));
}

// `files` maps each file name in assets/fonts to its text (licences) or to true (fonts);
// `pageFonts` lists the files the pages' own @font-face rules load (pageFontFiles).
export function fontProblems(css, files, pageFonts = []) {
  const problems = [];
  const faces = fontFaces(css);
  const used = new Set([...faces.flatMap(({ urls }) => urls), ...pageFonts]);
  for (const { family, urls, raw } of faces) {
    if (!urls.length) problems.push(`${STYLESHEET} @font-face for "${family}" loads no file.`);
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
