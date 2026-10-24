import assert from "node:assert/strict";
import { test } from "node:test";

import { MARK_READ_EVERY_MS, nextMark } from "./read-marks.ts";

/** Marks made as the newest message changes at `times` (ms), as the hook makes them. */
function marksFor(times: readonly number[]) {
  let state = { markedAt: -Infinity, readAt: 0 };
  let wakeAt: number | undefined;
  const marks = new Array<number>();
  let newest = 0;
  function mark(at: number) {
    state = { markedAt: at, readAt: newest };
    marks.push(newest);
    wakeAt = undefined;
  }
  for (const time of times) {
    if (wakeAt !== undefined && wakeAt <= time) mark(wakeAt);
    newest = time;
    const next = nextMark(state, newest, time);
    if (next === undefined) continue;
    if (next === "now") mark(time);
    else wakeAt = next;
  }
  if (wakeAt !== undefined) mark(wakeAt);
  return marks;
}

void test("a quiet conversation marks each message read as it arrives", () => {
  assert.deepEqual(marksFor([1, 5_000, 10_000]), [1, 5_000, 10_000]);
});

void test("a burst marks read every couple of seconds, ending on the newest", () => {
  // 300 messages over 83 seconds.
  const times = Array.from({ length: 300 }, (_, index) =>
    Math.round(1 + (index * 83_000) / 300),
  );
  const marks = marksFor(times);
  assert.ok(marks.length <= Math.ceil(83_000 / MARK_READ_EVERY_MS) + 1);
  assert.equal(marks.at(-1), times.at(-1));
});

void test("nothing newer, nothing to mark", () => {
  assert.equal(nextMark({ markedAt: 0, readAt: 10 }, 10, 5_000), undefined);
});
