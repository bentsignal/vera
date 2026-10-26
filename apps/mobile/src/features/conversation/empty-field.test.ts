import assert from "node:assert/strict";
import { test } from "node:test";

import { emptyFieldMaxHeight } from "./empty-field.ts";

void test("an empty Android field is held to one line of its text", () => {
  // Padding 18 and a 17 pt line of about 20 pt fit; two lines (about 58)
  // don't.
  assert.equal(emptyFieldMaxHeight(1), 40);
  assert.ok(emptyFieldMaxHeight(1) < 18 + 2 * 17 * 1.17);
});

void test("larger text gets a taller line, so the placeholder isn't cut", () => {
  for (const scale of [1.3, 2]) {
    assert.ok(emptyFieldMaxHeight(scale) >= 18 + 17 * 1.17 * scale);
  }
});
