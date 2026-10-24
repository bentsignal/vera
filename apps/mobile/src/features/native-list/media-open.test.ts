import assert from "node:assert/strict";
import { test } from "node:test";

import { listFocused, pressMedia } from "./media-open.ts";

void test("one tap opens one viewer, and back on the list a tap opens again at once", () => {
  // The list is in focus.
  let opening = listFocused();
  // The first press opens at once.
  const first = pressMedia(opening);
  assert.equal(first.opens, true);
  opening = first.opening;
  // The same fast repeat's second press, before the viewer covers the
  // list, opens nothing.
  const repeat = pressMedia(opening);
  assert.equal(repeat.opens, false);
  opening = repeat.opening;
  // Nor does anything while the viewer covers it.
  const covered = pressMedia(opening);
  assert.equal(covered.opens, false);
  opening = covered.opening;
  // Closed straight away: the list's screen is in focus again, and the
  // next press (the same photo or another) opens at once, with no wait.
  opening = listFocused();
  const reopen = pressMedia(opening);
  assert.equal(reopen.opens, true);
  assert.equal(pressMedia(reopen.opening).opens, false);
});
