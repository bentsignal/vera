import assert from "node:assert/strict";
import test from "node:test";

import { fakeCtx } from "./fakeCtx.ts";
import { liveCursor } from "./includes.ts";
import { pageOf } from "./paging.ts";
import { MESSAGE_PAGE_SIZE } from "./protocol.ts";

function messages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    attachments: [],
    authorId: "maya@vera.chat",
    authorName: "Maya",
    body: "",
    conversationId: "group:a",
    messageId: `m${String(index + 1)}`,
    sentAt: index + 1,
  }));
}

void test("a newer page is as small as asked, never larger than a page", async () => {
  const { ctx } = fakeCtx({ messages: messages(80) });
  const scope = { conversationId: "group:a" };
  const small = await pageOf(ctx, scope, { after: 10, limit: 20 });
  assert.equal(small.messages.length, 20);
  assert.equal(small.messages[0]?.sentAt, 11);
  assert.equal(small.hasNewer, true);
  const big = await pageOf(ctx, scope, { after: 0, limit: 500 });
  assert.equal(big.messages.length, MESSAGE_PAGE_SIZE);
  const plain = await pageOf(ctx, scope, { after: 0 });
  assert.equal(plain.messages.length, MESSAGE_PAGE_SIZE);
  const last = await pageOf(ctx, scope, { after: 70, limit: 20 });
  assert.equal(last.messages.length, 10);
  assert.equal(last.hasNewer, false);
});

void test("a small page that filled up is still followed by time", () => {
  assert.equal(liveCursor({ after: 5, limit: 20 }, { hasNewer: false }), 5);
  assert.equal(
    liveCursor({ after: 5, limit: 20 }, { hasNewer: true }),
    "byTime",
  );
  // Without a limit (older apps, or newer pages in older messages), a full
  // page's reactions come in a batch, as before.
  assert.equal(liveCursor({ after: 5 }, { hasNewer: true }), undefined);
  assert.equal(liveCursor({ after: 5 }, { hasNewer: false }), 5);
});
