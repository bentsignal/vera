import assert from "node:assert/strict";
import test from "node:test";

import type { ActivityItem } from "./activityShapes.ts";
import { compacted } from "./activity.ts";

const group = {
  conversationId: "group:a",
  kind: "group" as const,
  members: ["me@vera.chat", "maya@vera.chat", "leo@vera.chat"],
  name: "Climbing",
  spaceId: null,
};

function threadItem(threadId: string, at: number): ActivityItem {
  const message = {
    attachments: [],
    authorId: "maya@vera.chat",
    authorName: "Maya",
    body: threadId,
    conversationId: "group:a",
    linkPreview: null,
    messageId: `${threadId}:latest`,
    sentAt: at,
  };
  return {
    at,
    authors: ["maya@vera.chat"],
    conversation: group,
    count: 1,
    key: `thread:${threadId}`,
    kind: "thread",
    latest: message,
    root: null,
    threadId,
  };
}

void test("compact activity lists each conversation once, its items apart", () => {
  const items = [threadItem("t1", 3), threadItem("t2", 2), threadItem("t3", 1)];
  const { conversations, items: compact } = compacted(items);
  assert.deepEqual(conversations, [group]);
  // Three threads in one conversation stay three items, in order.
  assert.deepEqual(
    compact.map((item) => [item.key, item.conversationId]),
    [
      ["thread:t1", "group:a"],
      ["thread:t2", "group:a"],
      ["thread:t3", "group:a"],
    ],
  );
  assert.ok(compact.every((item) => !("conversation" in item)));
});
