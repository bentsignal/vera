import assert from "node:assert/strict";
import { test } from "node:test";

import type { MessageLayout } from "../preferences/store.ts";
import { LEO, message } from "../native-list/map-rows.testing.ts";
import { newestFirst } from "./build-rows.ts";

// A thread's original yesterday evening, and its replies this morning.
const root = message("root", -12 * 60);
const replies = [message("a", 0), message("b", 1, { authorId: LEO })];

function keys(layout: MessageLayout) {
  return newestFirst(replies, layout, { replyCount: 2, root })
    .map((row) => row.key)
    .reverse();
}

void test("a stacked thread has no day separators", () => {
  assert.deepEqual(keys("stacked"), ["root", "replies", "a", "b"]);
});

void test("a thread in bubbles keeps its time headers", () => {
  assert.deepEqual(keys("bubbles"), [
    "time-root",
    "root",
    "replies",
    "time-a",
    "a",
    "b",
  ]);
});
