import assert from "node:assert/strict";
import test from "node:test";

import { latestMessage } from "./chatMessages.ts";
import { fakeCtx } from "./fakeCtx.ts";

function message(messageId: string, sentAt: number, extra = {}) {
  return {
    attachments: [],
    authorId: "maya@vera.chat",
    authorName: "Maya",
    body: messageId,
    conversationId: "group:a",
    messageId,
    sentAt,
    ...extra,
  };
}

void test("the newest message shows, or the newest before deleted ones", async () => {
  const { ctx } = fakeCtx({
    messages: [
      message("first", 1),
      message("second", 2),
      message("reply", 3, { threadId: "second", threadOnly: true }),
    ],
  });
  const latest = await latestMessage(ctx, "group:a");
  assert.equal(latest.shown?.messageId, "second");
  assert.equal(latest.newestSentAt, 2);

  const deleted = fakeCtx({
    messages: [
      message("first", 1),
      message("second", 2, { deletedAt: 5 }),
      message("third", 3, { deletedAt: 6 }),
    ],
  });
  const past = await latestMessage(deleted.ctx, "group:a");
  assert.equal(past.shown?.messageId, "first");
  assert.equal(past.newestSentAt, 3);
});
