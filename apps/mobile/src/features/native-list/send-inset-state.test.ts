import assert from "node:assert/strict";
import { test } from "node:test";

import type { InsetState } from "./send-inset-state.ts";
import { changed, expired, insetOf, sentShorter } from "./send-inset-state.ts";

// A five-line send: the composer goes from 162 to 76 tall. The newest row
// was "m1" when it was sent; the message sent is "m2".
const AT_REST = { height: 162, held: undefined } satisfies InsetState;

void test("the old height holds until the render that brings the message sent", () => {
  const hold = { height: 162, newest: "m1" };
  const sent = sentShorter(AT_REST, 76, hold);
  // The render the composer shrinks in: the rows haven't changed.
  assert.equal(insetOf(sent, "m1"), 162);
  // The render that brings the message: the new height goes with it.
  assert.equal(insetOf(sent, "m2"), 76);
});

void test("it lets go after the wait if the message never shows", () => {
  const hold = { height: 162, newest: "m1" };
  const sent = sentShorter(AT_REST, 76, hold);
  assert.equal(insetOf(expired(sent, hold), "m1"), 76);
});

void test("a later send keeps its hold when the earlier one's time is up", () => {
  const first = { height: 162, newest: "m1" };
  const second = { height: 120, newest: "m2" };
  const both = sentShorter(sentShorter(AT_REST, 76, first), 76, second);
  const afterFirstTimer = expired(both, first);
  assert.equal(insetOf(afterFirstTimer, "m2"), 120);
  assert.equal(insetOf(afterFirstTimer, "m3"), 76);
});

void test("someone else's message arriving first lets the hold go with it", () => {
  // Not the message sent, but still a render whose rows change: native
  // takes the new height with that arrival, in one move.
  const sent = sentShorter(AT_REST, 76, { height: 162, newest: "m1" });
  assert.equal(insetOf(sent, "theirs"), 76);
});

void test("a line typed during the hold changes the height it lets go to", () => {
  const sent = sentShorter(AT_REST, 76, { height: 162, newest: "m1" });
  const typed = changed(sent, 98);
  assert.equal(insetOf(typed, "m1"), 162);
  assert.equal(insetOf(typed, "m2"), 98);
});

void test("a shrink noticed after the message is already in waits out the timer", () => {
  // Known limit: if the message sent rendered before the shrink reached
  // JavaScript, the hold is taken under it and only the timer lets go,
  // so the composer's height then reaches native alone, a beat late.
  const hold = { height: 162, newest: "m2" };
  const late = sentShorter(AT_REST, 76, hold);
  assert.equal(insetOf(late, "m2"), 162);
  assert.equal(insetOf(expired(late, hold), "m2"), 76);
});
