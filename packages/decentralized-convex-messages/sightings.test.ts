import assert from "node:assert/strict";
import test from "node:test";

import { activity, isUnseen } from "./activity.ts";
import { fakeCtx } from "./fakeCtx.ts";
import { seeConversationActivity } from "./sightings.ts";

const ME = "me@vera.chat";
const MAYA = "maya@vera.chat";
const LEO = "leo@vera.chat";
const HOUR = 60 * 60 * 1000;
const NOW = 30 * 24 * HOUR;

function message(conversationId: string, authorId: string, sentAt: number) {
  return {
    attachments: [],
    authorId,
    authorName: authorId,
    body: "",
    conversationId,
    messageId: `${conversationId}:${String(sentAt)}`,
    sentAt,
  };
}

function reaction(
  conversationId: string,
  accountId: string,
  messageId: string,
  reactedAt: number,
) {
  return {
    accountId,
    conversationId,
    emoji: "❤️",
    messageId,
    messageAuthorId: ME,
    reactedAt,
  };
}

function direct(conversationId: string) {
  return {
    conversation: {
      conversationId,
      createdBy: MAYA,
      kind: "direct",
      updatedAt: 0,
    },
    member: {
      accountId: ME,
      conversationId,
      lastReadAt: 0,
      muted: false,
      role: "member",
    },
  };
}

void test("reading again with nothing new writes nothing", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const [a, b] = [direct("direct:a"), direct("direct:b")];
  const { ctx, writes } = fakeCtx({
    conversations: [a.conversation, b.conversation],
    members: [a.member, b.member],
    messages: [
      { ...message("direct:a", ME, NOW - 3 * HOUR), messageId: "mine" },
      {
        ...message("direct:a", MAYA, NOW - 2 * HOUR),
        quote: { authorId: ME, body: "" },
        threadId: "mine",
      },
      { ...message("direct:b", ME, NOW - 3 * HOUR), messageId: "other" },
    ],
    reactions: [
      reaction("direct:a", MAYA, "mine", NOW - 2 * HOUR),
      reaction("direct:a", LEO, "mine", NOW - HOUR),
      // Another conversation's reaction isn't seen by reading this one.
      reaction("direct:b", MAYA, "other", NOW - HOUR),
    ],
  });
  await seeConversationActivity(ctx, ME, "direct:a", NOW - HOUR);
  const first = writes().length;
  assert.ok(first > 0);
  t.mock.timers.tick(5_000);
  await seeConversationActivity(ctx, ME, "direct:a", NOW - HOUR);
  assert.equal(writes().length, first);
  const unseen = (await activity(ctx, ME, { aboutYou: true }))
    .filter(isUnseen)
    .map((item) => item.key);
  assert.deepEqual(unseen, ["reactions:other"]);
});
