import assert from "node:assert/strict";
import { test } from "node:test";

import type { Pending } from "./reaction-toggles.ts";
import { overrideKey, settled, toggled } from "./reaction-toggles.ts";

const HEART = overrideKey("m1", 0, "❤️");
const NONE = new Map<string, Pending>();

void test("two taps before the next render are on, then off", () => {
  const first = toggled(NONE, HEART, false, 1);
  assert.equal(first.on, true);
  const second = toggled(first.next, HEART, false, 2);
  assert.equal(second.on, false);
  assert.deepEqual(second.next.get(HEART), { on: false, seq: 2 });
});

void test("a toggle starts from the server's answer when nothing is pending", () => {
  assert.equal(toggled(NONE, HEART, true, 1).on, false);
});

void test("an older answer doesn't let go of a newer toggle", () => {
  const first = toggled(NONE, HEART, false, 1).next;
  const second = toggled(first, HEART, false, 2).next;
  // The first toggle's answer arrives after the second was made.
  const afterFirst = settled(second, HEART, 1);
  assert.deepEqual(afterFirst.get(HEART), { on: false, seq: 2 });
  // The second's answer lets it go: the server's answer shows.
  assert.equal(settled(afterFirst, HEART, 2).has(HEART), false);
});

void test("a failed toggle rolls back to the server's answer", () => {
  const pending = toggled(NONE, HEART, false, 1).next;
  // Failed or done, the newest answer lets go; with the server unchanged,
  // the heart shows as it was.
  assert.equal(settled(pending, HEART, 1).size, 0);
});

void test("each part and emoji is its own toggle", () => {
  const onItem0 = toggled(NONE, HEART, false, 1).next;
  const onItem2 = overrideKey("m1", 2, "❤️");
  const onMessage = overrideKey("m1", "message", "❤️");
  assert.equal(toggled(onItem0, onItem2, false, 2).on, true);
  assert.equal(toggled(onItem0, onMessage, false, 3).on, true);
  assert.equal(toggled(onItem0, overrideKey("m1", 0, "😂"), false, 4).on, true);
  assert.deepEqual(settled(onItem0, onItem2, 2), onItem0);
});
