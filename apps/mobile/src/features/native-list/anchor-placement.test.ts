import assert from "node:assert/strict";
import { test } from "node:test";

import { createAnchorPlacement } from "./anchor-placement.ts";

function pending() {
  return Promise.withResolvers<void>();
}

void test("ready centers once and waits before showing; duplicate events do nothing", async () => {
  const task = pending();
  const calls = new Array<unknown>();
  const view = {
    scrollToRow: (id: string, animated: boolean) => {
      calls.push([id, animated]);
      return task.promise;
    },
  };
  const placement = createAnchorPlacement();
  placement.attach(view);
  const options = {
    anchor: "old",
    present: true,
    show: () => calls.push("show"),
    failed: () => calls.push("failed"),
  };
  placement.ready(options);
  placement.ready(options);
  assert.deepEqual(calls, [["old", false]]);
  task.resolve();
  await task.promise;
  assert.deepEqual(calls, [["old", false], "show"]);
  placement.ready(options);
  assert.equal(calls.length, 2);
});

void test("unmounted or replaced list can't reveal from a stale command", async () => {
  for (const replace of [false, true]) {
    const task = pending();
    let shown = 0;
    const placement = createAnchorPlacement();
    placement.attach({ scrollToRow: () => task.promise });
    placement.ready({
      anchor: "old",
      present: true,
      show: () => shown++,
      failed: () => assert.fail(),
    });
    placement.attach(null);
    if (replace) placement.attach({ scrollToRow: () => Promise.resolve() });
    task.resolve();
    await task.promise;
    assert.equal(shown, 0);
  }
});

void test("latest and missing target reveal without scrolling; unattached ready is ignored", () => {
  for (const anchor of [undefined, "missing"]) {
    let shown = 0;
    const placement = createAnchorPlacement();
    const options = {
      anchor,
      present: false,
      show: () => shown++,
      failed: () => assert.fail(),
    };
    placement.ready(options);
    assert.equal(shown, 0);
    placement.attach({
      scrollToRow: () => {
        assert.fail();
      },
    });
    placement.ready(options);
    assert.equal(shown, 1);
  }
});

void test("command rejection reveals once and reports only for the current list", async () => {
  const task = pending();
  const calls = new Array<string>();
  const placement = createAnchorPlacement();
  placement.attach({ scrollToRow: () => task.promise });
  placement.ready({
    anchor: "old",
    present: true,
    show: () => calls.push("show"),
    failed: () => calls.push("failed"),
  });
  task.reject();
  await assert.rejects(task.promise);
  assert.deepEqual(calls, ["failed", "show"]);
});
