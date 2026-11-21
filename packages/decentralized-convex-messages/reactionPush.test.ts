import assert from "node:assert/strict";
import test from "node:test";

import { fakeCtx } from "./fakeCtx.ts";
import { findReactionTargets } from "./reactionPush.ts";

const ME = "me@vera.chat";
const MAYA = "maya@vera.chat";
const STRANGER = "someone@other.example";
const GROUP = "group:vera.chat:1";
const OTHER = "group:vera.chat:2";

function setup() {
  function member(accountId: string, conversationId: string) {
    return {
      accountId,
      conversationId,
      lastReadAt: 0,
      muted: false,
      role: "member",
    };
  }
  return fakeCtx({
    conversations: [
      { conversationId: GROUP, createdBy: ME, kind: "group", updatedAt: 0 },
      { conversationId: OTHER, createdBy: ME, kind: "group", updatedAt: 0 },
    ],
    members: [
      member(ME, GROUP),
      member(MAYA, GROUP),
      member(ME, OTHER),
      member(STRANGER, OTHER),
    ],
    messages: [
      {
        attachments: [],
        authorId: ME,
        authorName: "Me",
        body: "private plans",
        conversationId: GROUP,
        messageId: "m1",
        sentAt: 1,
      },
    ],
    pushTokens: [{ accountId: ME, platform: "ios", token: "device" }],
  });
}

function reaction(accountId: string, conversationId: string) {
  return {
    accountId,
    conversationId,
    emoji: "❤️",
    messageId: "m1",
    reactedAt: 2,
  };
}

const ASK = { emoji: "❤️", messageId: "m1" };

void test("a member's reaction pushes to the message's author", async () => {
  const { ctx } = setup();
  await ctx.db.insert("reactions", reaction(MAYA, GROUP));
  const target = await findReactionTargets(ctx, { ...ASK, reactorId: MAYA });
  assert.equal(target?.message, "private plans");
  assert.equal(target.recipients.length, 1);
});

void test("a reaction left in another conversation sends no push", async () => {
  const { ctx } = setup();
  // A member of OTHER only, naming GROUP's message.
  await ctx.db.insert("reactions", reaction(STRANGER, OTHER));
  assert.equal(
    await findReactionTargets(ctx, { ...ASK, reactorId: STRANGER }),
    null,
  );
});

void test("someone who left the conversation sends no push", async () => {
  const { ctx } = setup();
  await ctx.db.insert("reactions", reaction(MAYA, GROUP));
  const left = await ctx.db
    .query("members")
    .withIndex("by_conversation_account", (index) =>
      index.eq("conversationId", GROUP).eq("accountId", MAYA),
    )
    .unique();
  assert.ok(left !== null);
  await ctx.db.delete(left._id);
  assert.equal(
    await findReactionTargets(ctx, { ...ASK, reactorId: MAYA }),
    null,
  );
});
