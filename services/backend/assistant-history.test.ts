import assert from "node:assert/strict";
import { test } from "node:test";

import { HISTORY, historyWindow, MAX_HISTORY } from "./assistant-history.ts";

function messages(count: number, start = 1) {
  return Array.from({ length: count }, (_, index) => ({
    sentAt: start + index,
  }));
}

void test("a short conversation is seen whole", () => {
  const all = messages(10);
  assert.deepEqual(historyWindow(all, null), { from: 1, messages: all });
});

void test("the first reply sees the newest messages", () => {
  const window = historyWindow(messages(100), null);
  assert.equal(window.messages.length, HISTORY);
  assert.equal(window.from, 61);
});

void test("the window only grows at the end until it's full", () => {
  // The last reply saw from message 61; 20 more have come since.
  const window = historyWindow(messages(120), 61);
  assert.equal(window.from, 61);
  assert.equal(window.messages.length, 60);
  assert.equal(window.messages[0]?.sentAt, 61);
});

void test("past the most, it moves on to the newest in one jump", () => {
  const window = historyWindow(messages(61 + MAX_HISTORY), 61);
  assert.equal(window.messages.length, HISTORY);
  assert.equal(window.from, 61 + MAX_HISTORY - HISTORY + 1);
});

void test("a window whose start wasn't loaded starts over", () => {
  // Messages loaded from 50 on, but the window started at 10.
  const window = historyWindow(messages(60, 50), 10);
  assert.equal(window.messages.length, HISTORY);
});

void test("a deleted first message moves the start to the next one", () => {
  const all = messages(30, 5);
  assert.deepEqual(historyWindow(all, 3), { from: 5, messages: all });
});
