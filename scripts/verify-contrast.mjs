import { readdir, readFile } from "node:fs/promises";

import { assertReferences, contrast } from "./contrast.mjs";

const root = new URL("../", import.meta.url);
const themes = (await readdir(root)).filter((file) => file.endsWith(".json")).sort();
const html = await readFile(new URL("index.html", root), "utf8");
const match = html.match(/const THEMES = (\[[\s\S]*?\n\]);/);

if (!match) throw new Error("Could not find the THEMES array in index.html.");

const gallery = JSON.parse(match[1]);
const galleryByName = new Map(gallery.map((row) => [row[0], row]));

assertReferences();

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

function cssColour(variable) {
  const variableMatch = html.match(
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

if (failures.length) {
  console.error(failures.join("\n"));
  console.error(`\n${failures.length} failure(s) across ${comparisons} contrast comparisons.`);
  process.exit(1);
}

console.log(
  `Verified ${themes.length} themes, ${comparisons} role-aware contrast comparisons, and gallery palette parity.`,
);
