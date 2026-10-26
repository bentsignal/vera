import assert from "node:assert/strict";
import { test } from "node:test";

import { replyOutcome } from "./reply-outcome.ts";

function step(...tools: string[]) {
  return { toolCalls: tools.map((toolName) => ({ toolName })) };
}

void test("a reply that sent something answered", () => {
  assert.equal(replyOutcome([step("send_message")], 1), "answered");
  // Support's privacy notice alone is a message too.
  assert.equal(replyOutcome([step("share_privacy_notice")], 1), "answered");
});

void test("a reply that called stay_quiet chose silence", () => {
  assert.equal(replyOutcome([step("stay_quiet")], 0), "quiet");
  assert.equal(
    replyOutcome([step("search_memory"), step("stay_quiet")], 0),
    "quiet",
  );
});

void test("plain text, or tools that never reached them, is an error", () => {
  // Grok writing "stay_quiet" as text instead of calling it.
  assert.equal(replyOutcome([step()], 0), "noToolCall");
  // A search, then an answer written as text.
  assert.equal(replyOutcome([step("web_search"), step()], 0), "noToolCall");
  assert.equal(replyOutcome([], 0), "noToolCall");
});
