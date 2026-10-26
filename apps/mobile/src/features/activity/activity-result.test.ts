import assert from "node:assert/strict";
import { test } from "node:test";

import { activityItems } from "./activity-result.ts";

const conversation = {
  conversationId: "channel:a",
  kind: "channel" as const,
  members: ["me@vera.chat", "maya@vera.chat"],
  name: "general",
  spaceId: "space:1",
};

function thread(threadId: string) {
  return {
    at: 1,
    authors: ["maya@vera.chat"],
    count: 1,
    key: `thread:${threadId}`,
    kind: "thread" as const,
    latest: {
      attachments: [],
      authorId: "maya@vera.chat",
      authorName: "Maya",
      body: "",
      conversationId: "channel:a",
      linkPreview: null,
      messageId: `${threadId}:latest`,
      sentAt: 1,
    },
    root: null,
    threadId,
  };
}

void test("compact activity comes back as separate items, each with its conversation", () => {
  const items = activityItems([
    {
      conversations: [conversation],
      items: ["t1", "t2"].map((id) => ({
        ...thread(id),
        conversationId: "channel:a",
      })),
    },
  ]);
  assert.deepEqual(
    items.map((item) => [item.key, item.conversation]),
    [
      ["thread:t1", conversation],
      ["thread:t2", conversation],
    ],
  );
  // From an older PDS: items as they were.
  const older = { ...thread("t3"), conversation };
  assert.deepEqual(activityItems([older]), [older]);
  assert.deepEqual(activityItems([[older]]), [older]);
});
