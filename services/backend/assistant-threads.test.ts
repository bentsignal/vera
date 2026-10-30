import assert from "node:assert/strict";
import { test } from "node:test";

import { replyThread, threadMessages } from "./assistant-threads.ts";

void test("a message in the conversation is answered there", () => {
  assert.equal(replyThread({}), null);
});

void test("a reply kept in its thread is answered in the thread", () => {
  assert.equal(replyThread({ threadId: "root", threadOnly: true }), "root");
});

void test("a reply sent from the conversation is answered there", () => {
  assert.equal(replyThread({ threadId: "root", threadOnly: false }), null);
  assert.equal(replyThread({ threadId: "root" }), null);
});

void test("a thread starts with its original", () => {
  const root = { body: "original" };
  const reply = { body: "reply" };
  assert.deepEqual(
    threadMessages("root", { hasOlder: false, messages: [reply], root }),
    [root, reply],
  );
});

void test("a page with older replies before it has no original", () => {
  const reply = { body: "reply" };
  assert.deepEqual(
    threadMessages("root", {
      hasOlder: true,
      messages: [reply],
      root: { body: "original" },
    }),
    [reply],
  );
});

void test("a thread whose original isn't here is just its replies", () => {
  const reply = { body: "reply" };
  assert.deepEqual(
    threadMessages("root", { hasOlder: false, messages: [reply], root: null }),
    [reply],
  );
});

void test("replies quote only what isn't the original", () => {
  const replies = [
    { body: "first", quote: { messageId: "root" } },
    { body: "second", quote: { messageId: "first-reply" } },
  ];
  assert.deepEqual(
    threadMessages("root", { hasOlder: true, messages: replies, root: null }),
    [{ body: "first" }, replies[1]],
  );
});
