// Checks the three Mail quoted-text levels of every theme against the
// background they are actually drawn on — Apple's dark message background,
// not the theme's own `bg`, which Mail does not let us set.
//
//   node mail/quote-contrast.mjs           # table + summary
//   node mail/quote-contrast.mjs --failing # only the themes needing a swap
//
// Exits non-zero if any level fails the 4.5:1 body-text floor after the
// documented `claudeShimmer` substitution has been applied.
//
// `analyse()` is also imported by scripts/verify.mjs, which asserts that the
// substitution table in mail/README.md still matches what this computes — so
// editing a theme's `claude` or `permission` value fails CI until the doc is
// brought along with it.

import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { assertReferences, contrast } from "../scripts/contrast.mjs";

const root = new URL("../", import.meta.url);
export const MAIL_BG = "#1E1E1E";
export const FLOOR = 4.5;

export { contrast };

const LEVELS = [
  ["one", "claude"],
  ["two", "permission"],
  ["three", "inactive"],
];

export async function analyse() {
  assertReferences();
  const files = (await readdir(root)).filter((f) => f.endsWith(".json")).sort();
  const rows = [];
  for (const file of files) {
    const { name, overrides } = JSON.parse(await readFile(new URL(file, root), "utf8"));
    const levels = LEVELS.map(([label, key]) => {
      const colour = overrides[key];
      const ratio = contrast(colour, MAIL_BG);
      const passes = ratio >= FLOOR;
      return {
        label,
        key,
        colour,
        ratio,
        passes,
        substitute: passes ? null : overrides.claudeShimmer,
        substituteRatio: passes ? null : contrast(overrides.claudeShimmer, MAIL_BG),
      };
    });
    rows.push({ name, levels });
  }
  return rows;
}

// Every level that fails and therefore appears in the mail/README.md table,
// flattened in the order the table lists them.
export const failingLevels = (rows) =>
  rows.flatMap((row) =>
    row.levels
      .filter((l) => !l.passes)
      .map((l) => ({
        theme: row.name,
        level: l.label,
        colour: l.colour,
        ratio: l.ratio,
        substitute: l.substitute,
        substituteRatio: l.substituteRatio,
      })),
  );

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const rows = await analyse();
  const onlyFailing = process.argv.includes("--failing");
  const needsSwap = rows.filter((r) => r.levels.some((l) => !l.passes));

  for (const row of onlyFailing ? needsSwap : rows) {
    const cells = row.levels.map((l) => {
      const head = `${l.colour} ${l.ratio.toFixed(2)}`;
      return l.passes ? head : `${head} → ${l.substitute} ${l.substituteRatio.toFixed(2)}`;
    });
    console.log(`${row.name.padEnd(14)} ${cells.join("  |  ")}`);
  }

  console.log(
    `\n${rows.length} themes on ${MAIL_BG}. ` +
      `${needsSwap.length} need a substitute on at least one level; ` +
      `${rows.length - needsSwap.length} clear ${FLOOR}:1 as they stand.`,
  );

  const unfixable = failingLevels(rows).filter((f) => f.substituteRatio < FLOOR);
  if (unfixable.length) {
    console.error(
      `Still below ${FLOOR}:1 after substitution: ` +
        `${unfixable.map((f) => `${f.theme} level ${f.level}`).join(", ")}.`,
    );
    process.exit(1);
  }
}
