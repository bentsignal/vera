import assert from "node:assert/strict";
import { test } from "node:test";

import { createUIFault } from "./send-ui-fault-state.ts";

void test("a UI fault requires an active probe and cannot exceed its recovery bound", () => {
  const fault = createUIFault();
  assert.throws(() => fault.arm(900, false), /Start the DEV send probe/);
  for (const duration of [0, -1, 1501, Infinity, NaN, 0.5]) {
    assert.throws(() => fault.arm(duration, true), RangeError);
  }
  assert.equal(fault.take(), 0);
});

void test("a stall is consumed exactly once and stop clears an unused arm", () => {
  const fault = createUIFault();
  fault.arm(900, true);
  assert.equal(fault.take(), 900);
  assert.equal(fault.take(), 0);
  fault.arm(1500, true);
  fault.clear();
  assert.equal(fault.take(), 0);
});
