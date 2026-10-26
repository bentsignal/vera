import assert from "node:assert/strict";
import { test } from "node:test";

import { newestFirst } from "../conversation/build-rows.ts";
import { isJumbo } from "./jumbo.ts";
import { parseReactionKey, reactionKey, spansOf } from "./map-blocks.ts";
import {
  blockAt,
  context,
  LEO,
  MAYA,
  message,
  messageRows,
  only,
  rowsOf,
  START,
} from "./map-rows.testing.ts";
import { nativeRows } from "./map-rows.ts";

void test("text becomes spans with mentions and links", () => {
  const spans = spansOf("hey @Maya Chen see https://vera.chat ok", [
    { accountId: MAYA, name: "Maya Chen" },
  ]);
  assert.deepEqual(spans, [
    { text: "hey " },
    { accountId: MAYA, style: "mention", text: "@Maya Chen" },
    { text: " see " },
    { style: "link", text: "https://vera.chat", url: "https://vera.chat" },
    { text: " ok" },
  ]);
});

void test("only emoji, up to three, is jumbo", () => {
  for (const jumbo of ["😂", "😂 😂😂", "👍🏽", "👨‍👩‍👧", "🇨🇦", "❤️"]) {
    assert.equal(isJumbo(jumbo), true, jumbo);
  }
  for (const plain of ["😂😂😂😂", "lol 😂", "123", ""]) {
    assert.equal(isJumbo(plain), false, plain);
  }
  const row = only(messageRows(rowsOf([message("a", 0, { body: "🔥🔥" })])));
  assert.equal(blockAt(row, 0, "text").jumbo, true);
});

void test("reaction keys carry their part", () => {
  assert.deepEqual(parseReactionKey(reactionKey("2", "👍")), {
    emoji: "👍",
    part: 2,
  });
  assert.deepEqual(parseReactionKey(reactionKey("link-1", "❤️")), {
    emoji: "❤️",
    part: "link-1",
  });
  assert.deepEqual(parseReactionKey("🔥"), { emoji: "🔥", part: "message" });
});

void test("notices", () => {
  const notice = {
    accountId: LEO,
    at: new Date(START + 60_000),
    id: "n1",
    kind: "joined",
    name: "Leo",
  } as const;
  const rows = nativeRows(
    newestFirst([message("a", 0)], "bubbles", undefined, [notice]),
    [],
    context(),
  );
  assert.deepEqual(rows[0], {
    fallbackText: "Leo joined the conversation",
    id: "n1",
    kind: "notice",
    spans: [
      { style: "bold", text: "Leo" },
      { text: " joined the conversation" },
    ],
  });
});
