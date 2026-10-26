import assert from "node:assert/strict";
import { test } from "node:test";

import { formatMessageTime, formatTime, formatTimeAgo } from "./format.ts";

void test("time ago reads in the largest whole unit", () => {
  const now = new Date(2026, 9, 16, 12, 0);
  function before(minutes: number) {
    return formatTimeAgo(new Date(now.getTime() - minutes * 60_000), now);
  }
  assert.equal(before(0), "Just now");
  assert.equal(before(5), "5m ago");
  assert.equal(before(59), "59m ago");
  assert.equal(before(2 * 60 + 10), "2h ago");
  assert.equal(before(3 * 24 * 60), "3d ago");
  assert.equal(before(8 * 24 * 60).endsWith("ago"), false);
});

void test("a message's time gains its day once it isn't today's", () => {
  const now = new Date(2026, 9, 25, 9, 41);
  function day(date: Date, options: Intl.DateTimeFormatOptions) {
    return `${date.toLocaleDateString(undefined, options)} · ${formatTime(date)}`;
  }
  const today = new Date(2026, 9, 25, 0, 5);
  assert.equal(formatMessageTime(today, now), formatTime(today));
  const yesterday = new Date(2026, 9, 24, 23, 55);
  assert.equal(
    formatMessageTime(yesterday, now),
    `Yesterday · ${formatTime(yesterday)}`,
  );
  const thursday = new Date(2026, 9, 22, 15, 5);
  assert.equal(
    formatMessageTime(thursday, now),
    day(thursday, { weekday: "short" }),
  );
  const october = new Date(2026, 9, 12, 11, 30);
  assert.equal(
    formatMessageTime(october, now),
    day(october, { month: "short", day: "numeric" }),
  );
  const lastYear = new Date(2025, 11, 3, 20, 2);
  assert.equal(
    formatMessageTime(lastYear, now),
    day(lastYear, { month: "short", day: "numeric", year: "numeric" }),
  );
  assert.equal(
    formatMessageTime(yesterday, now, ", "),
    `Yesterday, ${formatTime(yesterday)}`,
  );
});
