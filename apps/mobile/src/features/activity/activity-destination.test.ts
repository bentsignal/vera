import assert from "node:assert/strict";
import { test } from "node:test";

import { activityDestination } from "./activity-destination.ts";

const context = { account: "a@home", title: "Chat" };
const conversation = { conversationId: "chat" };
const reply = {
  messageId: "old-reply",
  sentAt: 123,
  threadId: "root",
  threadOnly: true,
};

void test("thread-only reactions and mentions carry exact target and time", () => {
  for (const kind of ["reactions", "mention", "reply"] as const) {
    assert.deepEqual(
      activityDestination({
        ...context,
        item: { kind, conversation, message: reply },
      }),
      {
        pathname: "/thread/[threadId]",
        params: {
          account: "a@home",
          conversationId: "chat",
          threadId: "root",
          messageId: "old-reply",
          targetSentAt: "123",
        },
      },
    );
  }
});

void test("grouped thread Activity targets its indicated latest reply", () => {
  const route = activityDestination({
    ...context,
    item: { kind: "thread", conversation, threadId: "root", latest: reply },
  });
  assert.equal(route.pathname, "/thread/[threadId]");
  assert.equal(route.params.messageId, "old-reply");
  assert.equal(
    "targetSentAt" in route.params && route.params.targetSentAt,
    "123",
  );
});

void test("conversation target and ordinary message Activity routes remain unchanged", () => {
  assert.deepEqual(
    activityDestination({
      ...context,
      item: {
        kind: "reactions",
        conversation,
        message: { ...reply, threadOnly: false },
      },
    }),
    {
      pathname: "/conversation/[conversationId]",
      params: {
        account: "a@home",
        conversationId: "chat",
        title: "Chat",
        messageId: "old-reply",
      },
    },
  );
  assert.deepEqual(
    activityDestination({
      ...context,
      item: { kind: "messages", conversation },
    }),
    {
      pathname: "/conversation/[conversationId]",
      params: { account: "a@home", conversationId: "chat", title: "Chat" },
    },
  );
});
