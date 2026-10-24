import assert from "node:assert/strict";
import { test } from "node:test";

import { loadedBatchWith } from "./loaded-batch.ts";

function keyOf(conversationId: string) {
  return (messageIds: readonly string[]) => [
    "pds",
    "session",
    "me@vera.chat",
    "query",
    { operation: { args: { conversationId, messageIds }, type: "reactions" } },
  ];
}

const loaded = { result: [], status: "success" };
const loading = { status: "loading" };

void test("a message's reactions come from the conversation's batch that has it", () => {
  const key = keyOf("c1");
  const cached = [
    [key(["a", "b"]), loaded],
    [key(["c", "d", "e"]), loaded],
  ] as const;
  assert.deepEqual(loadedBatchWith(cached, key, "d"), ["c", "d", "e"]);
});

void test("a batch still loading isn't used", () => {
  const key = keyOf("c1");
  assert.equal(
    loadedBatchWith([[key(["a", "b"]), loading]], key, "a"),
    undefined,
  );
  assert.deepEqual(
    loadedBatchWith(
      [
        [key(["a", "b"]), loading],
        [key(["a"]), { result: [], status: "partial" }],
      ],
      key,
      "a",
    ),
    ["a"],
  );
});

void test("another conversation's batch, or another kind of query, isn't used", () => {
  const cached = [
    [keyOf("c2")(["a"]), loaded],
    [
      [
        "pds",
        "session",
        "me@vera.chat",
        "query",
        {
          operation: {
            args: { conversationId: "c1", messageIds: ["a"] },
            type: "threadSummaries",
          },
        },
      ],
      loaded,
    ],
  ] as const;
  assert.equal(loadedBatchWith(cached, keyOf("c1"), "a"), undefined);
});

void test("nothing loaded leaves the sheet to ask for itself", () => {
  assert.equal(loadedBatchWith([], keyOf("c1"), "a"), undefined);
});
