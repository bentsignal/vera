import assert from "node:assert/strict";
import test from "node:test";

import { unreadCount } from "./chatMessages.ts";
import { fakeCtx } from "./fakeCtx.ts";
import {
  markNumberDeleted,
  numberedUnread,
  numberMessages,
} from "./sequences.ts";

const ME = "me@vera.chat";
const MAYA = "maya@vera.chat";
const MINUTE = 60_000;
const NOW = 100 * MINUTE;

function message(index: number, extra = {}) {
  return {
    attachments: [],
    authorId: MAYA,
    authorName: "Maya",
    body: "",
    conversationId: "group:a",
    messageId: `m${String(index)}`,
    sentAt: index * 1000,
    ...extra,
  };
}

function messages(count: number) {
  return Array.from({ length: count }, (_, index) => message(index + 1));
}

void test("unread is the newest number less the reader's, past 99", async () => {
  const { ctx } = fakeCtx({ messages: messages(500) });
  // Before numbering, counted one by one, stopping past 99.
  assert.equal(await numberedUnread(ctx, "group:a", ME, 0), undefined);
  assert.equal(await unreadCount(ctx, "group:a", ME, 0), 100);
  // Numbered in batches of 200, oldest first.
  for (let run = 0; run < 3; run += 1) {
    await numberMessages(ctx, "group:a", { now: NOW });
  }
  assert.equal(await unreadCount(ctx, "group:a", ME, 0), 500);
  assert.equal(await unreadCount(ctx, "group:a", ME, 100_000), 400);
  assert.equal(await unreadCount(ctx, "group:a", ME, 500_000), 0);
});

void test("deleted messages and the newest, not yet numbered, count right", async () => {
  const { ctx, rows } = fakeCtx({
    messages: [
      ...messages(10),
      // Kept for its thread, deleted before it was numbered.
      message(11, { deletedAt: 1 }),
    ],
  });
  await numberMessages(ctx, "group:a", { force: true, now: NOW });
  assert.equal(rows("chatSequence").length, 11);
  assert.equal(await unreadCount(ctx, "group:a", ME, 0), 10);
  // Deleted after it was numbered.
  await markNumberDeleted(ctx, "m5");
  assert.equal(await unreadCount(ctx, "group:a", ME, 0), 9);
  assert.equal(await unreadCount(ctx, "group:a", ME, 5_000), 5);
  // Sent since: not numbered yet, counted one by one; your own aren't.
  const { ctx: later } = fakeCtx({
    chatSequence: rows("chatSequence"),
    messages: [
      ...messages(11),
      message(12),
      message(13, { authorId: ME }),
      message(14, { deletedAt: 1 }),
    ],
  });
  assert.equal(await unreadCount(later, "group:a", ME, 5_000), 6);
  assert.equal(await unreadCount(later, "group:a", ME, 12_000), 0);
});

void test("a busy conversation is numbered about once a minute", async () => {
  // A message every 2 seconds, the newest just sent.
  const stream = Array.from({ length: 20 }, (_, index) =>
    message(index, { sentAt: NOW - 40_000 + index * 2000 }),
  );
  const { ctx, rows } = fakeCtx({ messages: stream });
  // A later look is coming and the oldest has waited 40 s: not yet.
  await numberMessages(ctx, "group:a", { now: NOW });
  assert.equal(rows("chatSequence").length, 0);
  // A minute on, the settled ones are numbered at once.
  await numberMessages(ctx, "group:a", { now: NOW + 25_000 });
  assert.equal(rows("chatSequence").length, 20);
  // The count was right either way.
  assert.equal(await unreadCount(ctx, "group:a", ME, 0), 20);
});
