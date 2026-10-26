import assert from "node:assert/strict";
import { test } from "node:test";

import { composerTop } from "./jump-lift.ts";

// The iOS simulator's stacked conversation (a 874 pt screen): the composer
// bar is 76 pt tall with its 20 pt bottom inset, its top at 798 with the
// keyboard down and at 490 with it up (a 328 pt keyboard).

void test("with the keyboard down, it's the composer's height", () => {
  assert.equal(
    composerTop({
      bottomInset: 20,
      composer: 76,
      keyboardHeight: 0,
      progress: 0,
    }),
    76,
  );
});

void test("with the keyboard up, it's where the composer rose to", () => {
  const top = composerTop({
    bottomInset: 20,
    composer: 76,
    keyboardHeight: -328,
    progress: 1,
  });
  // The bar's top at 490 is 384 above the bottom.
  assert.equal(874 - top, 490);
});

void test("halfway, it moves with the composer", () => {
  const top = composerTop({
    bottomInset: 20,
    composer: 76,
    keyboardHeight: -164,
    progress: 0.5,
  });
  assert.equal(top, 76 + 164 - 10);
});

void test("a taller composer lifts it with the keyboard up too", () => {
  // Ten lines: the bar's top went to 292 with the keyboard up.
  const top = composerTop({
    bottomInset: 20,
    composer: 274,
    keyboardHeight: -328,
    progress: 1,
  });
  assert.equal(874 - top, 292);
});
