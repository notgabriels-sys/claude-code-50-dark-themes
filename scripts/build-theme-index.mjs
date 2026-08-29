// Builds themes.json — a stable, machine-readable index of all 50 themes.
//
// Why this exists. The gallery on gabs-utilities.com renders its cards from an
// inline JS array, so a crawler, an aggregator or an agent that wants the theme
// set has nothing to read: the names exist only after script execution, and the
// 50 source files give no single entry point. This publishes one.
//
// Every field is DERIVED from the theme's own source file. Nothing here is
// hand-written per theme, so the index cannot drift from what actually ships —
// `verify` rebuilds it and fails on any difference. If you want to change what
// the index says, change this generator, never themes.json.
//
// Deliberately absent: prices, product links, anything about the paid shop.
// This file describes the free MIT-licensed themes only. See CLAUDE.md on why
// no unverified price is published to a machine-readable surface.

import { readFile, readdir, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

// themes.json lives at the repo root next to the 50 theme files, because that
// is the URL worth publishing (gabs-utilities.com/themes.json). That makes it
// the one root-level .json that is NOT a theme, and every place which globs
// root *.json has to say so: this generator, `verify`'s 50-file count, and
// sync-plugin-themes.mjs, which would otherwise ship the index inside the
// plugin. `verify` asserts that exclusion rather than trusting it.
export const NOT_A_THEME = new Set(["themes.json"]);

export const isThemeFile = (file) =>
  file.endsWith(".json") && !NOT_A_THEME.has(file);
const SITE = "https://gabs-utilities.com";
const REPO = "https://github.com/notgabriels-sys/claude-code-50-dark-themes";

// The gallery keys each card on these roles, so the index exposes the same ones
// rather than dumping every override — a consumer wanting the full palette has
// `source` to fetch.
const SUMMARY_ROLES = ["claude", "claudeShimmer", "text", "inactive"];

export async function buildThemeIndex() {
  const files = (await readdir(root)).filter(isThemeFile).sort();

  const themes = [];
  for (const file of files) {
    const theme = JSON.parse(await readFile(new URL(file, root), "utf8"));
    const id = file.replace(/\.json$/, "");
    const palette = {};
    for (const role of SUMMARY_ROLES) {
      if (theme.overrides[role]) palette[role] = theme.overrides[role];
    }
    themes.push({
      id,
      name: theme.name,
      base: theme.base,
      palette,
      source: `${REPO}/blob/main/${file}`,
      url: `${SITE}/#theme-${id}`,
    });
  }

  return {
    $schema: "https://schema.org/ItemList",
    name: "50 Dark Themes for Claude Code",
    description:
      "Machine-readable index of every theme in the 50 Dark Themes plugin for " +
      "Claude Code. Free and MIT-licensed. Generated from the theme files " +
      "themselves by scripts/build-theme-index.mjs.",
    license: "https://opensource.org/license/mit",
    homepage: `${SITE}/`,
    repository: REPO,
    install: "claude plugin install 50-dark-themes@notgabriels-themes",
    count: themes.length,
    themes,
  };
}

export function serializeThemeIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

// Only write when run directly, so `verify` can import and compare without
// touching the working tree.
if (import.meta.url === `file://${process.argv[1]}`) {
  const index = await buildThemeIndex();
  await writeFile(new URL("themes.json", root), serializeThemeIndex(index));
  console.log(`Built themes.json with ${index.count} themes.`);
}
