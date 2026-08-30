import { readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const themes = (await readdir(root)).filter((file) => file.endsWith(".json")).sort();
const html = await readFile(new URL("index.html", root), "utf8");
const match = html.match(/const THEMES = (\[[\s\S]*?\n\]);/);

if (!match) throw new Error("Could not find the THEMES array in index.html.");

const gallery = JSON.parse(match[1]);
const galleryByName = new Map(gallery.map((row) => [row[0], row]));

function rgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid six-digit hex colour: ${hex}`);
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function luminance(hex) {
  const [red, green, blue] = rgb(hex).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const references = [
  ["#000000", "#FFFFFF", 21],
  ["#777777", "#FFFFFF", 4.48],
  ["#0000FF", "#FFFFFF", 8.59],
];
for (const [foreground, background, expected] of references) {
  const actual = contrast(foreground, background);
  if (Math.abs(actual - expected) > 0.01) {
    throw new Error(
      `Contrast reference failed for ${foreground} on ${background}: ${actual.toFixed(2)} != ${expected.toFixed(2)}`,
    );
  }
}

const checks = [
  // Primary copy is held to WCAG AAA. It can appear on the terminal canvas or
  // the opaque fullscreen user-message surface.
  { token: "text", floor: 7, surfaces: ["terminal", "userMessageBackground"] },
  // Readable secondary copy meets WCAG AA for normal text on every surface.
  { token: "inactive", floor: 4.5, surfaces: ["terminal", "userMessageBackground"] },
  // Claude's label and autocomplete suggestions are foreground content.
  { token: "claude", floor: 4.5, surfaces: ["terminal"] },
  { token: "claudeShimmer", floor: 4.5, surfaces: ["terminal"] },
  { token: "suggestion", floor: 4.5, surfaces: ["terminal"] },
  // Claude Code documents these as borders, indicators, and a usage-meter fill.
  { token: "permission", floor: 3, surfaces: ["terminal"] },
  { token: "planMode", floor: 3, surfaces: ["terminal"] },
  { token: "promptBorder", floor: 3, surfaces: ["terminal"] },
  { token: "promptBorderShimmer", floor: 3, surfaces: ["terminal"] },
  { token: "rate_limit_fill", floor: 3, surfaces: ["terminal"] },
  // `subtle` is intentionally reserved by this pack for non-essential
  // decorative hairlines. Readable secondary content uses `inactive`.
];

const failures = [];
let comparisons = 0;

function cssColour(variable, source = html) {
  const variableMatch = source.match(
    new RegExp(`--${variable}\\s*:\\s*(#[0-9a-f]{6})\\s*;`, "i"),
  );
  if (!variableMatch) throw new Error(`Could not find --${variable} in index.html.`);
  return variableMatch[1];
}

const storefrontFaint = cssColour("faint");
for (const surfaceName of ["ground", "ground-2"]) {
  comparisons += 1;
  const surface = cssColour(surfaceName);
  const ratio = contrast(storefrontFaint, surface);
  if (ratio < 4.5) {
    failures.push(
      `Storefront: --faint on --${surfaceName} is ${ratio.toFixed(2)}:1; needs 4.5:1`,
    );
  }
}

// The storefront's syntax sample is also the shared personal coding palette.
// Every semantic foreground must remain readable as normal text across the
// terminal canvas, page canvas, and raised install panel—not merely look
// distinct in one screenshot.
const semanticTokens = [
  "syntax-purple",
  "syntax-light-purple",
  "syntax-grey-purple",
  "syntax-dark-blue",
  "syntax-blue",
  "syntax-light-blue",
  "ink",
  "syntax-dark-grey",
];
for (const token of semanticTokens) {
  const foreground = cssColour(token);
  for (const surfaceName of ["terminal-surface", "ground", "ground-2"]) {
    comparisons += 1;
    const surface = cssColour(surfaceName);
    const ratio = contrast(foreground, surface);
    if (ratio < 4.5) {
      failures.push(
        `Storefront: --${token} on --${surfaceName} is ${ratio.toFixed(2)}:1; needs 4.5:1`,
      );
    }
  }
}

const sharedPaletteTokens = [...semanticTokens, "terminal-surface"];
for (const page of [
  "claude-code-theme-install-guide.html",
  "semantic-terminal-colors.html",
  "assets/social-preview.html",
]) {
  const pageHtml = await readFile(new URL(page, root), "utf8");
  for (const token of sharedPaletteTokens) {
    const expected = cssColour(token).toLowerCase();
    const actual = cssColour(token, pageHtml).toLowerCase();
    if (actual !== expected) {
      failures.push(`${page}: --${token} ${actual} does not match storefront ${expected}`);
    }
  }
}

if (galleryByName.size !== gallery.length) {
  failures.push("Gallery display names must be unique.");
}

for (const file of themes) {
  const theme = JSON.parse(await readFile(new URL(file, root), "utf8"));
  const row = galleryByName.get(theme.name);
  if (!row) {
    failures.push(`${file}: missing gallery row`);
    continue;
  }

  const [name, claude, claudeShimmer, text, inactive, terminal] = row;
  const expected = { claude, claudeShimmer, text, inactive };
  for (const [token, value] of Object.entries(expected)) {
    if (theme.overrides[token].toLowerCase() !== value.toLowerCase()) {
      failures.push(
        `${file}: gallery ${token} ${value} does not match theme ${theme.overrides[token]}`,
      );
    }
  }

  const surfaces = { terminal, userMessageBackground: theme.overrides.userMessageBackground };
  for (const check of checks) {
    const foreground = theme.overrides[check.token];
    for (const surfaceName of check.surfaces) {
      comparisons += 1;
      const ratio = contrast(foreground, surfaces[surfaceName]);
      if (ratio + Number.EPSILON < check.floor) {
        failures.push(
          `${name}: ${check.token} on ${surfaceName} is ${ratio.toFixed(2)}:1; needs ${check.floor.toFixed(1)}:1`,
        );
      }
    }
  }

  const surfaceChecks = [
    ["userMessageBackground", theme.overrides.userMessageBackground, "terminal", terminal],
    [
      "userMessageBackgroundHover",
      theme.overrides.userMessageBackgroundHover,
      "userMessageBackground",
      theme.overrides.userMessageBackground,
    ],
  ];
  for (const [surfaceName, surface, referenceName, reference] of surfaceChecks) {
    comparisons += 1;
    const ratio = contrast(surface, reference);
    if (ratio < 1.08) {
      failures.push(
        `${name}: ${surfaceName} is not visibly distinct from ${referenceName} (${ratio.toFixed(2)}:1; needs 1.08:1)`,
      );
    }
  }
}

// Dark Themes Vol. 2 has no storefront gallery yet; its preview terminal
// colours live in the plugin's previews.json and are held to the same floors.
const vol2Root = new URL("../plugins/dark-themes-vol-2/", import.meta.url);
const vol2Themes = (await readdir(new URL("themes/", vol2Root)))
  .filter((file) => file.endsWith(".json"))
  .sort();
const vol2Previews = JSON.parse(await readFile(new URL("previews.json", vol2Root), "utf8"));

for (const file of vol2Themes) {
  const theme = JSON.parse(await readFile(new URL(`themes/${file}`, vol2Root), "utf8"));
  const terminal = vol2Previews[theme.name];
  if (!terminal) {
    failures.push(`dark-themes-vol-2/${file}: missing preview terminal colour in previews.json`);
    continue;
  }

  const surfaces = { terminal, userMessageBackground: theme.overrides.userMessageBackground };
  for (const check of checks) {
    const foreground = theme.overrides[check.token];
    for (const surfaceName of check.surfaces) {
      comparisons += 1;
      const ratio = contrast(foreground, surfaces[surfaceName]);
      if (ratio + Number.EPSILON < check.floor) {
        failures.push(
          `${theme.name}: ${check.token} on ${surfaceName} is ${ratio.toFixed(2)}:1; needs ${check.floor.toFixed(1)}:1`,
        );
      }
    }
  }

  const surfaceChecks = [
    ["userMessageBackground", theme.overrides.userMessageBackground, "terminal", terminal],
    [
      "userMessageBackgroundHover",
      theme.overrides.userMessageBackgroundHover,
      "userMessageBackground",
      theme.overrides.userMessageBackground,
    ],
  ];
  for (const [surfaceName, surface, referenceName, reference] of surfaceChecks) {
    comparisons += 1;
    const ratio = contrast(surface, reference);
    if (ratio < 1.08) {
      failures.push(
        `${theme.name}: ${surfaceName} is not visibly distinct from ${referenceName} (${ratio.toFixed(2)}:1; needs 1.08:1)`,
      );
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  console.error(`\n${failures.length} failure(s) across ${comparisons} contrast comparisons.`);
  process.exit(1);
}

console.log(
  `Verified ${themes.length + vol2Themes.length} themes, ${comparisons} role-aware contrast comparisons, gallery parity, and shared semantic palette parity.`,
);

// Exported so verify.mjs can hold the public pages to the real number. Every
// surface that prints a comparison count is making a claim to a reader.
export const roleAwareComparisonCount = comparisons;
