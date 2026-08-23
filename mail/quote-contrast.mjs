// Checks the three Mail quoted-text levels of every theme against the
// background they are actually drawn on — Apple's dark message background,
// not the theme's own `bg`, which Mail does not let us set.
//
//   node mail/quote-contrast.mjs           # table + summary
//   node mail/quote-contrast.mjs --failing # only the themes needing a swap
//
// Exits non-zero if any level fails the 4.5:1 body-text floor after the
// documented `claudeShimmer` substitution has been applied.

import { readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const MAIL_BG = "#1E1E1E";
const FLOOR = 4.5;

const channel = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  // Every channel goes through the sRGB transfer function. Linearising two of
  // three and leaving the blue raw produces plausible-looking ratios that are
  // wrong by a factor of thirty — hence the self-test below.
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Reference values from the WCAG 2.x definition. If these drift, every number
// this script prints is untrustworthy, so refuse to print any of them.
for (const [a, b, expected] of [
  ["#FFFFFF", "#000000", 21.0],
  ["#767676", "#FFFFFF", 4.54],
  ["#000000", "#000000", 1.0],
]) {
  const got = contrast(a, b);
  if (Math.abs(got - expected) > 0.01) {
    console.error(`Self-test failed: ${a} on ${b} = ${got.toFixed(2)}, expected ${expected}.`);
    process.exit(2);
  }
}

const LEVELS = [
  ["one", "claude"],
  ["two", "permission"],
  ["three", "inactive"],
];

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

const onlyFailing = process.argv.includes("--failing");
const needsSwap = rows.filter((r) => r.levels.some((l) => !l.passes));

for (const row of onlyFailing ? needsSwap : rows) {
  const cells = row.levels.map((l) => {
    const head = `${l.colour} ${l.ratio.toFixed(2)}`;
    return l.passes ? head : `${head} → ${l.substitute} ${l.substituteRatio.toFixed(2)}`;
  });
  console.log(`${row.name.padEnd(14)} ${cells.join("  |  ")}`);
}

const unfixable = rows.flatMap((r) =>
  r.levels.filter((l) => !l.passes && l.substituteRatio < FLOOR).map((l) => `${r.name} level ${l.label}`),
);

console.log(
  `\n${rows.length} themes on ${MAIL_BG}. ` +
    `${needsSwap.length} need a substitute on at least one level; ` +
    `${rows.length - needsSwap.length} clear ${FLOOR}:1 as they stand.`,
);

if (unfixable.length) {
  console.error(`Still below ${FLOOR}:1 after substitution: ${unfixable.join(", ")}.`);
  process.exit(1);
}
