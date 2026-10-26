import assert from "node:assert/strict";
import { test } from "node:test";

import { summarize } from "./frame-summary.ts";

void test("fixed thresholds count every frame over them, beyond the worst ten", () => {
  // 120 Hz: 200 frames of 8.3 ms, then twelve of 20 ms and three of 40 ms.
  const intervals = [
    ...Array.from({ length: 200 }, () => 8.3),
    ...Array.from({ length: 12 }, () => 20),
    ...Array.from({ length: 3 }, () => 40),
  ];
  const report = summarize(intervals);
  assert.equal(report.hz, 120);
  assert.equal(report.over16ms, 15);
  assert.equal(report.over33ms, 3);
  assert.equal(report.worstMs, 40);
  // The hitch count is unchanged: over 1.5 refreshes.
  assert.equal(report.slow, 15);
  assert.equal(report.worst.length, 10);
});

void test("the fixed thresholds are exactly 16.7 ms and 33 ms", () => {
  const report = summarize([
    1000 / 60, // one 60 Hz refresh, 16.67: not over 16.7
    16.7, // exactly the threshold: not over
    16.71,
    33, // exactly the threshold: not over
    33.01,
    1000 / 30, // two 60 Hz refreshes, 33.33: over 33
    ...Array.from({ length: 60 }, () => 1000 / 60),
  ]);
  assert.deepEqual(report.thresholdsMs, { over16ms: 16.7, over33ms: 33 });
  assert.equal(report.over16ms, 4);
  assert.equal(report.over33ms, 2);
  assert.equal(report.worstMs, 33.3);
});

void test("a steady 60 Hz recording has nothing over either threshold", () => {
  const report = summarize(Array.from({ length: 60 }, () => 1000 / 60));
  assert.equal(report.over16ms, 0);
  assert.equal(report.over33ms, 0);
  assert.equal(report.slow, 0);
  assert.equal(report.worstMs, 16.7);
});
