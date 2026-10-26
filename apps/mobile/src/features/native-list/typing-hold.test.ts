import assert from "node:assert/strict";
import { test } from "node:test";

import {
  dropLeaving,
  dueBy,
  holdLeftMs,
  holdTypists,
  NO_TYPING,
  timerChanges,
  TYPING_HOLD_MS,
} from "./typing-hold.ts";

function typing(shown: string[], newestKey = "m1") {
  return { leaving: [], newestKey, shown };
}
const fromMe = { authorId: "me", key: "m1" };

void test("people start typing in the order they started", () => {
  const first = holdTypists(NO_TYPING, ["maya"], [fromMe]);
  assert.deepEqual(first.shown, ["maya"]);
  const both = holdTypists(first, ["maya", "leo"], [fromMe]);
  assert.deepEqual(both.shown, ["maya", "leo"]);
  assert.deepEqual(both.leaving, []);
});

void test("a typist's message arriving as they stop takes their place at once", () => {
  const next = holdTypists(
    typing(["maya"]),
    [],
    [{ authorId: "maya", key: "m2" }, fromMe],
  );
  assert.deepEqual(next.shown, []);
  assert.deepEqual(next.leaving, []);
});

void test("someone who stops before their message arrives waits for it", () => {
  const stopped = holdTypists(typing(["maya"]), [], [fromMe]);
  assert.deepEqual(stopped.shown, ["maya"]);
  assert.deepEqual(stopped.leaving, ["maya"]);
  // Their message, a moment later, goes in as the typing row goes.
  const sent = holdTypists(
    stopped,
    [],
    [{ authorId: "maya", key: "m2" }, fromMe],
  );
  assert.deepEqual(sent.shown, []);
  assert.deepEqual(sent.leaving, []);
});

void test("someone else's message doesn't let a waiting typist go", () => {
  const stopped = holdTypists(typing(["maya", "leo"]), ["leo"], [fromMe]);
  const leoSent = holdTypists(
    stopped,
    [],
    [{ authorId: "leo", key: "m2" }, fromMe],
  );
  assert.deepEqual(leoSent.shown, ["maya"]);
  assert.deepEqual(leoSent.leaving, ["maya"]);
});

void test("someone who sends nothing goes when their time is up", () => {
  const stopped = holdTypists(typing(["maya", "leo"]), ["leo"], [fromMe]);
  const later = dropLeaving(stopped, ["maya"]);
  assert.deepEqual(later.shown, ["leo"]);
  assert.deepEqual(later.leaving, []);
});

void test("typing again keeps someone in their place", () => {
  const stopped = holdTypists(typing(["maya", "leo"]), ["leo"], [fromMe]);
  const again = holdTypists(stopped, ["leo", "maya"], [fromMe]);
  assert.deepEqual(again.shown, ["maya", "leo"]);
  assert.deepEqual(again.leaving, []);
  assert.deepEqual(dropLeaving(again, ["maya"]).shown, ["maya", "leo"]);
});

void test("each person who stops gets their own time, not a shared one", () => {
  // Maya stops: her timer starts.
  assert.deepEqual(timerChanges([], ["maya"]), { start: ["maya"], stop: [] });
  // Leo stops later: only his starts, so Maya's isn't pushed back.
  assert.deepEqual(timerChanges(["maya"], ["maya", "leo"]), {
    start: ["leo"],
    stop: [],
  });
  // Maya's message arrives: hers stops, Leo's runs on.
  assert.deepEqual(timerChanges(["maya", "leo"], ["leo"]), {
    start: [],
    stop: ["maya"],
  });
});

void test("one person's time running out doesn't let another go", () => {
  const both = holdTypists(typing(["maya", "leo"]), [], [fromMe]);
  assert.deepEqual(both.leaving, ["maya", "leo"]);
  const mayaGone = dropLeaving(both, ["maya"]);
  assert.deepEqual(mayaGone.shown, ["leo"]);
  assert.deepEqual(mayaGone.leaving, ["leo"]);
});

void test("a timer set again later only waits out the rest of the hold", () => {
  // Maya stopped at 0; Leo stops at 900, and her timer is set again.
  assert.equal(holdLeftMs(0, 0), TYPING_HOLD_MS);
  assert.equal(holdLeftMs(0, 900), TYPING_HOLD_MS - 900);
  assert.equal(holdLeftMs(0, 1500), 0);
});

void test("the soonest timer lets go only those who stopped by then", () => {
  const stopped = new Map([
    ["maya", 0],
    ["priya", 0],
    ["leo", 900],
  ]);
  assert.deepEqual(dueBy(stopped, 0), ["maya", "priya"]);
  assert.deepEqual(dueBy(stopped, 900), ["maya", "priya", "leo"]);
});

void test("two typists' messages arriving in one update both take the typing row", () => {
  // Maya and Leo were typing; both their messages land in the same rows
  // update as their typing stops (Leo's is the newest).
  const both = typing(["maya", "leo"]);
  const next = holdTypists(
    both,
    [],
    [{ authorId: "leo", key: "m3" }, { authorId: "maya", key: "m2" }, fromMe],
  );
  assert.deepEqual(next.shown, []);
  assert.deepEqual(next.leaving, []);
  assert.equal(next.newestKey, "m3");
});

void test("one of two typists sending leaves the other typing", () => {
  const next = holdTypists(
    typing(["maya", "leo"]),
    ["maya"],
    [{ authorId: "leo", key: "m2" }, fromMe],
  );
  assert.deepEqual(next.shown, ["maya"]);
  assert.deepEqual(next.leaving, []);
});

void test("more arrivals than it looks through all count as arrived", () => {
  // The last newest row ("m1") is past the rows looked through.
  const flood = Array.from({ length: 20 }, (_, index) => ({
    authorId: index === 7 ? "maya" : "priya",
    key: `f${index}`,
  }));
  const next = holdTypists(typing(["maya", "leo"]), [], flood);
  assert.deepEqual(next.shown, ["leo"]);
  assert.deepEqual(next.leaving, ["leo"]);
});
