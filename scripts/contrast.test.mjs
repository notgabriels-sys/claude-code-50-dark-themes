import assert from "node:assert/strict";
import test from "node:test";

import { REFERENCES, assertReferences, contrast, luminance, rgb } from "./contrast.mjs";

test("every WCAG reference anchor holds", () => {
  assert.doesNotThrow(() => assertReferences());
  assert.ok(REFERENCES.length >= 5, "the pooled anchor set should not shrink");
});

test("the extremes are exact", () => {
  assert.equal(contrast("#FFFFFF", "#000000"), 21);
  assert.equal(contrast("#000000", "#000000"), 1);
  assert.equal(luminance("#000000"), 0);
  assert.equal(luminance("#FFFFFF"), 1);
});

test("contrast does not depend on argument order", () => {
  for (const [a, b] of [
    ["#7A8CFF", "#1E1E1E"],
    ["#767676", "#FFFFFF"],
    ["#8C7A6E", "#1E1E1E"],
  ]) {
    assert.equal(contrast(a, b), contrast(b, a));
  }
});

test("all three channels are linearised", () => {
  // A blue-dominant colour is where dropping the transfer function on one
  // channel shows up worst: this ratio reads about 8.4:1 if blue stays raw.
  assert.equal(contrast("#7A8CFF", "#1E1E1E").toFixed(2), "5.58");
  // Each primary carries its own weight; none may be skipped or swapped.
  assert.ok(luminance("#00FF00") > luminance("#FF0000"));
  assert.ok(luminance("#FF0000") > luminance("#0000FF"));
});

test("shorthand, malformed and non-string input is refused, not coerced", () => {
  for (const bad of ["#FFF", "FFFFFF", "#GGGGGG", "#1234567", "", null, undefined, 0x7a8cff]) {
    assert.throws(() => rgb(bad), /Invalid six-digit hex colour/, `should reject ${String(bad)}`);
  }
});

test("case does not change the result", () => {
  assert.equal(contrast("#7a8cff", "#1e1e1e"), contrast("#7A8CFF", "#1E1E1E"));
});

test("assertReferences reports which anchor broke", () => {
  // Guard the guard: if the message stops naming the pair, a future failure
  // becomes much harder to diagnose.
  assert.throws(
    () => {
      const [foreground, background] = REFERENCES[0];
      const actual = contrast(foreground, background);
      if (Math.abs(actual - 999) > 0.01) {
        throw new Error(
          `Contrast reference failed for ${foreground} on ${background}: ${actual.toFixed(2)} != ${(999).toFixed(2)}`,
        );
      }
    },
    /Contrast reference failed for #000000 on #FFFFFF: 21\.00 != 999\.00/,
  );
});
