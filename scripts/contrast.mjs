// The one WCAG 2.x contrast implementation in this repository.
//
// Two gates depend on it, against different backgrounds:
//   scripts/verify-contrast.mjs — theme tokens on the surfaces Claude Code
//     draws them on, which this pack controls.
//   mail/quote-contrast.mjs     — the Mail quoted-text levels on Apple's
//     message background, which it does not.
//
// Keeping one implementation is the point: two copies of this arithmetic can
// drift apart silently and then disagree about whether a palette ships.
// scripts/contrast.test.mjs pins the behaviour.

const HEX = /^#[0-9a-f]{6}$/i;

export function rgb(hex) {
  if (typeof hex !== "string" || !HEX.test(hex)) {
    throw new Error(`Invalid six-digit hex colour: ${hex}`);
  }
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

export function luminance(hex) {
  // Every channel goes through the sRGB transfer function. Linearising two of
  // three and leaving the third raw produces plausible-looking ratios that are
  // wrong by more than an order of magnitude — the reference set below exists
  // because exactly that bug shipped once.
  const [red, green, blue] = rgb(hex).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Anchors from the WCAG 2.x definition, pooled from both gates so neither can
// drift on its own. #767676 and #777777 straddle the 4.5:1 boundary on white,
// which is where an error in the transfer function shows up first.
export const REFERENCES = [
  ["#000000", "#FFFFFF", 21],
  ["#777777", "#FFFFFF", 4.48],
  ["#767676", "#FFFFFF", 4.54],
  ["#0000FF", "#FFFFFF", 8.59],
  ["#000000", "#000000", 1],
];

// Throws unless the implementation still agrees with every anchor. Call this
// before reporting any ratio; a checker that is quietly wrong is worse than no
// checker, because it is believed.
export function assertReferences() {
  for (const [foreground, background, expected] of REFERENCES) {
    const actual = contrast(foreground, background);
    if (Math.abs(actual - expected) > 0.01) {
      throw new Error(
        `Contrast reference failed for ${foreground} on ${background}: ${actual.toFixed(2)} != ${expected.toFixed(2)}`,
      );
    }
  }
}
