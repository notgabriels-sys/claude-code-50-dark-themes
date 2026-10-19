#!/usr/bin/env node
// Renders the "Start here" row in index.html: five of the fifty, each chosen by
// a contrast measurement against the theme's recommended terminal background,
// with the figure printed beside it. The row sits between two HTML comments in
// index.html; verify.mjs renders this block again from today's theme files and
// fails when the page carries anything else between the markers, so the page
// can never name a pick the numbers no longer support.
//
//   node scripts/build-quick-picks.mjs   rewrites the block in index.html
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { contrast, loadThemes, ratioText } from "./build-theme-pages.mjs";

export const QUICK_PICKS_START = "<!-- quick-picks:start -->";
export const QUICK_PICKS_END = "<!-- quick-picks:end -->";
// Only the fifty: the row introduces the collection the page is named for, and
// a Vol. 2 pick would need its own install command beside it.
export const QUICK_PICKS_PACK = "50-dark-themes";
// The families the finder offers that the row covers, in display order. Each
// pick is the family member whose accent (the `claude` token) reads strongest
// against its terminal background.
export const FAMILY_PICKS = [
  ["neutral", "Neutral"],
  ["warm", "Warm"],
  ["cool", "Cool"],
];

const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byName = (a, b) => a.theme.name.localeCompare(b.theme.name, "en");
const joinNames = (entries) => entries.map((entry) => entry.theme.name).join(" and ");
// Small counts read as words in running copy.
const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const countWord = (count) => COUNT_WORDS[count] ?? String(count);
const capitalize = (word) => word[0].toUpperCase() + word.slice(1);

// The two measurements a pick is chosen by, both against the recommended
// terminal background (the only surface a terminal application lets a theme
// assume): primary text, and the accent.
export function measure(theme) {
  return {
    theme,
    text: contrast(theme.overrides.text, theme.terminal),
    accent: contrast(theme.overrides.claude, theme.terminal),
  };
}

export function computeQuickPicks(themes) {
  const pool = themes.filter((theme) => theme.pack.id === QUICK_PICKS_PACK).map(measure);
  if (pool.length < 2) throw new Error(`Need at least two ${QUICK_PICKS_PACK} themes to pick from; found ${pool.length}.`);
  const picks = [];
  const taken = new Set();
  const take = (pick) => {
    picks.push(pick);
    taken.add(pick.theme.slug);
  };

  // Ties at full precision go to the name that sorts first, so the result is
  // the same on every run.
  const byTextDescending = [...pool].sort((a, b) => b.text - a.text || byName(a, b));
  const strongest = byTextDescending[0];
  take({
    key: "maximum-contrast",
    kicker: "Maximum contrast",
    ...strongest,
    fact: `Primary text ${ratioText(strongest.text)} on ${strongest.theme.terminal}, the highest of all ${pool.length}.`,
  });

  // The verifier holds primary text to WCAG AAA (7:1) on every theme, so the
  // lowest figure in the pack is the gentlest reading contrast that still
  // clears that floor.
  const softest = byTextDescending[byTextDescending.length - 1];
  take({
    key: "long-sessions",
    kicker: "Long sessions",
    ...softest,
    fact: `Primary text ${ratioText(softest.text)} on ${softest.theme.terminal}, the softest of all ${pool.length} and still above the 7:1 AAA floor.`,
  });

  for (const [family, kicker] of FAMILY_PICKS) {
    const members = pool
      .filter((entry) => entry.theme.family === family)
      .sort((a, b) => b.accent - a.accent || byName(a, b));
    if (members.length === 0) {
      throw new Error(`No ${family} theme among the ${pool.length}; the finder offers that family, so the row cannot skip it.`);
    }
    const index = members.findIndex((entry) => !taken.has(entry.theme.slug));
    if (index === -1) throw new Error(`Every ${family} theme already holds a pick; the row needs one more ${family} theme.`);
    const pick = members[index];
    const strength =
      members.length === 1 ? `the only ${family} accent` : `the strongest of the ${members.length} ${family} accents`;
    // When the family's strongest accent already holds a pick above, say so
    // instead of calling the runner-up the strongest.
    const fact =
      index === 0
        ? `Accent ${ratioText(pick.accent)} on ${pick.theme.terminal}, ${strength}.`
        : `Accent ${ratioText(pick.accent)} on ${pick.theme.terminal}, ${strength} after ${joinNames(members.slice(0, index))} above.`;
    take({ key: family, kicker, ...pick, fact });
  }
  return picks;
}

export function renderQuickPicks(picks, total) {
  const items = picks
    .map(({ theme, kicker, fact }) => {
      const style = `--bg:${theme.terminal};--a:${theme.overrides.claude};--fg:${theme.overrides.text};--mut:${theme.overrides.inactive}`;
      return `        <li><a class="pick" href="/theme/${theme.slug}/" style="${style}">
          <span class="pick-kicker">${esc(kicker)}</span>
          <span class="pick-name"><i class="pick-dot" aria-hidden="true"></i>${esc(theme.name)}</span>
          <span class="pick-fact">${esc(fact)}</span>
        </a></li>`;
    })
    .join("\n");
  return `${QUICK_PICKS_START}
    <nav class="quick-picks" aria-labelledby="quick-picks-title">
      <p class="finder-label" id="quick-picks-title">Start here</p>
      <p class="finder-copy">${capitalize(countWord(picks.length))} of the ${total}, chosen by contrast measured against each theme&rsquo;s recommended terminal background, not by taste. Every figure is on the theme&rsquo;s page.</p>
      <ul class="pick-list">
${items}
      </ul>
    </nav>
    ${QUICK_PICKS_END}`;
}

// The block index.html must carry between the markers, rendered from today's
// theme files.
export async function buildQuickPicks(root) {
  const themes = await loadThemes(root);
  const total = themes.filter((theme) => theme.pack.id === QUICK_PICKS_PACK).length;
  return renderQuickPicks(computeQuickPicks(themes), total);
}

// Replaces the block between the markers (markers included) with `block`.
export function placeQuickPicks(html, block) {
  const start = html.indexOf(QUICK_PICKS_START);
  const end = start === -1 ? -1 : html.indexOf(QUICK_PICKS_END, start + QUICK_PICKS_START.length);
  if (start === -1 || end === -1) {
    throw new Error(`index.html has no ${QUICK_PICKS_START} … ${QUICK_PICKS_END} block to fill. Add both markers inside the collection section first.`);
  }
  return html.slice(0, start) + block + html.slice(end + QUICK_PICKS_END.length);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = new URL("../", import.meta.url);
  const target = new URL("index.html", root);
  const html = await readFile(target, "utf8");
  const block = await buildQuickPicks(root);
  await writeFile(target, placeQuickPicks(html, block));
  console.log(`Wrote ${block.match(/class="pick"/g).length} quick picks into index.html.`);
}
