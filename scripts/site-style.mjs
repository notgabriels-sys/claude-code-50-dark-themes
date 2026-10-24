// The site wears the Familiars page's look through one shared stylesheet, assets/site.css, and
// the pages listed in SITE_PAGES build their own layout on top of it. These rules hold the
// stylesheet and those pages to what the look promises a reader:
//
// 1. Palette. Every colour written in assets/site.css is one of the house palette's sixteen
//    (PALETTE below, dark and light, from the design base), at any opacity. transparent and
//    currentColor are not colours of their own; colour functions other than rgb() and rgba(),
//    and named colours, are not used, so every colour can be read against the table.
// 2. Two themes. The light theme is declared twice: inside @media (prefers-color-scheme: light)
//    for :root:not([data-theme="dark"]), the visitor whose system is light and who has not chosen
//    dark on the switch, and as :root[data-theme="light"], the visitor who chose light. The two
//    declare the same tokens with the same values, and between them every token of the dark
//    :root that holds a colour, so no colour stays dark by omission. A specimen (.specimen,
//    .cmd: a terminal shown on the page) re-declares tokens only to the dark theme's values.
// 3. Contrast, in each theme, with WCAG 2.x's formula: every text token on every surface at
//    4.5:1, the floor for normal text, including over the violet wash of a selected chip; the
//    page colour on an ink fill (the primary pill's label) at 4.5:1; and the two marks that are
//    never text (the ember point, and the sun or moon on the switch's violet knob) at 3:1, the
//    floor for graphical objects. Ember is held to the lower floor because it is never text:
//    no color declaration in the stylesheet or a page's <style> uses it.
// 4. Motion only when the visitor allows it. Every animation in the stylesheet and in a page's
//    own <style>, and every transform on :hover, sits inside
//    @media (prefers-reduced-motion: no-preference), or the same selector turns it off inside
//    @media (prefers-reduced-motion: reduce). With reduced motion on, nothing moves.
// 5. The pages on the base link assets/site.css before their own <style>, so the page's layout
//    builds on the shared tokens; carry the ambient lights and the theme switch, wired to the key
//    the Familiars page keeps the choice under, so one choice holds across the site; preload no
//    font the stylesheet does not use; and fetch no font from a third party.
// 6. Fonts. Every @font-face points at a file in assets/fonts, every font file there is used by
//    one, and every family ships with its SIL Open Font License, which both fonts are under.
//
// What cannot pass is a colour the design base does not name, a light theme that differs by
// which way the visitor arrived at it, text below the floor in either theme, motion that runs
// against a visitor's setting, a page that drops the base, or a font served without its licence.

export const STYLESHEET = "assets/site.css";
export const SITE_PAGES = ["index.html"];
export const THEME_KEY = "familiars-theme";

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
const MOTION_ALLOWED = "@media(prefers-reduced-motion:no-preference)";
const MOTION_REDUCED = "@media(prefers-reduced-motion:reduce)";

// CSS Color 4 named colours.
const NAMED_COLOURS = new Set(
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(" "),
);
const COLOUR_PROPERTY = /^(--|color$|background|border|outline|box-shadow$|text-shadow$|text-decoration|caret-color$|accent-color$|fill$|stroke$|column-rule)/;

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
        if (hasBlock(body)) walk(body, [...context, squash(prelude)]);
        else {
          const declarations = splitTop(body, ";")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
              const colon = part.indexOf(":");
              const property = (colon < 0 ? part : part.slice(0, colon)).trim().toLowerCase();
              const value = colon < 0 ? "" : part.slice(colon + 1).replace(/!\s*important\s*$/i, "").trim();
              return { property, value };
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
  walk(source.replace(/\/\*[\s\S]*?\*\//g, ""), []);
  return rules;
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
  const bare = value.replace(/url\([^)]*\)/gi, "").replace(/"[^"]*"|'[^']*'/g, "");
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
  if (COLOUR_PROPERTY.test(property)) {
    const words = bare.replace(/var\([^)]*\)/gi, "").replace(/#[0-9a-f]+\b/gi, "").match(/[a-z]+(?:-[a-z]+)*/gi) ?? [];
    for (const word of words) {
      if (NAMED_COLOURS.has(word.toLowerCase())) found.push({ text: word, problem: "is a named colour; write the palette colour as hex" });
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
  for (const rule of rules.filter((candidate) => selectorsOf(candidate).some((selector) => selector === ".specimen" || selector === ".cmd"))) {
    for (const [token, value] of tokensOf(rule)) {
      if (squash(value) !== squash(dark.get(token) ?? "")) {
        problems.push(`${STYLESHEET} ${rule.selector}: a specimen re-declares ${token} as ${value}, but the dark theme's value is ${dark.get(token) ?? "not declared"}; a terminal shown on the page keeps the dark theme in either theme.`);
      }
    }
  }

  // 3. Contrast.
  for (const [name, tokens] of Object.entries({ dark, light })) {
    const solid = (token) => {
      const value = tokens.get(`--${token}`);
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

  // 4. Motion.
  problems.push(...motionProblems(rules, STYLESHEET));
  return problems;
}

export function emberTextProblems(rules, label) {
  return rules.flatMap((rule) =>
    rule.declarations
      .filter(({ property, value }) => ["color", "-webkit-text-fill-color"].includes(property) && /var\(\s*--ember\s*[,)]/i.test(value))
      .map(({ property }) => `${label} ${rule.selector} { ${property}: var(--ember) }: ember is a point, never text; it is held to the 3:1 floor for marks, and fails the 4.5:1 text floor on the light theme. Colour text with --ink, --mute or --accent.`),
  );
}

// 4. Every animation and every transform on :hover runs only when motion is allowed, or the same
// selector turns it off when it is not.
export function motionProblems(rules, label) {
  const problems = [];
  const off = new Set(
    rules
      .filter((rule) => rule.context.includes(MOTION_REDUCED) && rule.declarations.some(({ property, value }) => ["animation", "animation-name"].includes(property) && /^none$/i.test(value.trim())))
      .flatMap(selectorsOf),
  );
  for (const rule of rules) {
    if (rule.context.includes(MOTION_ALLOWED) || rule.context.some((at) => at.startsWith("@keyframes"))) continue;
    for (const { property, value } of rule.declarations) {
      const animates = ["animation", "animation-name"].includes(property) && !splitTop(value, ",").every((part) => /^none(\s|$)/i.test(part.trim()));
      const moves = ["transform", "translate", "rotate", "scale"].includes(property) && !/^none$/i.test(value) && selectorsOf(rule).some((selector) => selector.includes(":hover"));
      if (!animates && !moves) continue;
      const unguarded = selectorsOf(rule).filter((selector) => !(animates && off.has(selector)));
      if (!unguarded.length) continue;
      problems.push(`${label} ${rule.selector} { ${property}: ${value} } runs whatever the visitor's motion setting; put it inside @media (prefers-reduced-motion: no-preference)${animates ? ", or turn it off for the same selector inside @media (prefers-reduced-motion: reduce)" : ""}.`);
    }
  }
  return problems;
}

// --- the pages ----------------------------------------------------------------------------------

const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
const attributes = (tag) => new Map([...tag.matchAll(/([a-z-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi)].slice(1).map(([, name, value = ""]) => [name.toLowerCase(), value.replace(/^["']|["']$/g, "")]));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((match) => ({ index: match.index, attributes: attributes(match[0]) }));
// A link on the page as a path from the repository root.
const fromPage = (href, path) => new URL(href, `https://site/${path}`).pathname.slice(1);

// `fontFiles` is what the stylesheet's @font-face rules load, as paths from the repository root.
export function pageProblems(html, path, fontFiles = []) {
  const problems = [];
  const sheet = tags(html, "link").find((link) => (link.attributes.get("rel") ?? "").split(/\s+/).includes("stylesheet") && fromPage(link.attributes.get("href") ?? "", path) === STYLESHEET);
  const firstStyle = html.search(/<style\b/i);
  if (!sheet) problems.push(`${path} does not link ${STYLESHEET} (<link rel="stylesheet" href="${STYLESHEET}">), so it does not wear the site's look.`);
  else if (firstStyle >= 0 && sheet.index > firstStyle) problems.push(`${path} links ${STYLESHEET} after its own <style>, so the shared tokens would override the page's layout; link it first.`);
  const lights = html.match(/<div\b[^>]*\bclass\s*=\s*"lights"[^>]*>([\s\S]*?)<\/div>/i);
  if (!lights || !/aria-hidden\s*=\s*"true"/i.test(lights[0]) || !["l1", "l2", "l3"].every((name) => new RegExp(`<span\\b[^>]*class\\s*=\\s*"${name}"`, "i").test(lights[1]))) {
    problems.push(`${path} does not carry the ambient lights: <div class="lights" aria-hidden="true"> holding spans of class l1, l2 and l3.`);
  }
  const button = tags(html, "button").find((tag) => tag.attributes.get("id") === "themeSwitch");
  if (!button || !(button.attributes.get("class") ?? "").split(/\s+/).includes("theme-switch") || button.attributes.get("type") !== "button" || !button.attributes.has("hidden")) {
    problems.push(`${path} does not carry the theme switch as <button class="theme-switch" id="themeSwitch" type="button" hidden>; it stays hidden until the page's script can work it.`);
  }
  const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((match) => match[1]).join("\n");
  if (!/getElementById\(\s*["']themeSwitch["']\s*\)/.test(scripts) || !new RegExp(`["']${THEME_KEY}["']`).test(scripts)) {
    problems.push(`${path}'s script does not work the theme switch under the key "${THEME_KEY}", the one the Familiars page keeps the choice under, so a choice made on one page would not hold on the other.`);
  }
  if (/fonts\.(googleapis|gstatic)\.com/i.test(html)) problems.push(`${path} fetches a font from Google; the site serves its own fonts from assets/fonts, with no third-party request.`);
  for (const link of tags(html, "link").filter((tag) => tag.attributes.get("rel") === "preload" && tag.attributes.get("as") === "font")) {
    const href = link.attributes.get("href") ?? "";
    if (!fontFiles.includes(fromPage(href, path))) problems.push(`${path} preloads the font ${href}, which no @font-face in ${STYLESHEET} loads, so the visitor downloads it for nothing.`);
    if (!link.attributes.has("crossorigin")) problems.push(`${path} preloads the font ${href} without crossorigin; fonts are fetched in CORS mode, so the browser would fetch it twice.`);
  }
  const rules = [...html.matchAll(STYLE_BLOCK)].flatMap((match) => parseCss(match[1]));
  problems.push(...emberTextProblems(rules, path));
  problems.push(...motionProblems(rules, path));
  return problems;
}

// --- fonts --------------------------------------------------------------------------------------

// The @font-face rules: family and the file each loads, as a path from the repository root.
export function fontFaces(css) {
  return parseCss(css)
    .filter((rule) => squash(rule.selector) === "@font-face")
    .map((rule) => {
      const get = (name) => rule.declarations.find(({ property }) => property === name)?.value ?? "";
      const family = get("font-family").replace(/^["']|["']$/g, "");
      const urls = [...get("src").matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map(([, url]) => new URL(url, `https://site/${STYLESHEET}`).pathname.slice(1));
      return { family, urls };
    });
}

// `files` maps each file name in assets/fonts to its text (licences) or to true (fonts).
export function fontProblems(css, files) {
  const problems = [];
  const faces = fontFaces(css);
  const used = new Set(faces.flatMap(({ urls }) => urls));
  for (const { family, urls } of faces) {
    if (!urls.length) problems.push(`${STYLESHEET} @font-face for "${family}" loads no file.`);
    for (const url of urls) {
      if (!url.startsWith("assets/fonts/") || !(url.slice("assets/fonts/".length) in files)) problems.push(`${STYLESHEET} @font-face for "${family}" loads ${url}, which is not a file in assets/fonts.`);
    }
    const licence = `OFL-${family.replace(/\s+/g, "")}.txt`;
    const text = files[licence];
    if (typeof text !== "string" || !/SIL OPEN FONT LICENSE/i.test(text)) {
      problems.push(`assets/fonts/${licence} is missing or is not the SIL Open Font License; "${family}" is served under the OFL, which travels with the font.`);
    }
  }
  for (const name of Object.keys(files)) {
    if (/\.(ttf|otf|woff2?)$/i.test(name) && !used.has(`assets/fonts/${name}`)) problems.push(`assets/fonts/${name} is not loaded by any @font-face in ${STYLESHEET}; remove it or use it.`);
  }
  return problems;
}
