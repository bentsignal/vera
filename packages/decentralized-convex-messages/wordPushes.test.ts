import assert from "node:assert/strict";
import test from "node:test";

import { activity } from "./activity.ts";
import { setAlerts } from "./alerts.ts";
import { fakeCtx } from "./fakeCtx.ts";
import { listeners } from "./listeners.ts";
import { noteWordsSaid, saysWord, wordCandidates } from "./mentions.ts";
import { notificationSettings, setNotificationSettings } from "./settings.ts";
import { GROUP, LEO, MAYA, ME, setup } from "./threads.testing.ts";

type Ctx = ReturnType<typeof setup>["ctx"];

/** A stored message, and the group it's in. */
async function stored(ctx: Ctx, messageId: string) {
  const [message, conversation] = await Promise.all([
    ctx.db
      .query("messages")
      .withIndex("by_message", (index) => index.eq("messageId", messageId))
      .unique(),
    ctx.db
      .query("conversations")
      .withIndex("by_conversation", (index) =>
        index.eq("conversationId", GROUP),
      )
      .unique(),
  ]);
  assert.ok(message !== null && conversation !== null);
  return { conversation, members: [ME, MAYA, LEO], message };
}

/** Whose words a stored message may say. */
async function candidatesOf(ctx: Ctx, messageId: string) {
  const { conversation, members, message } = await stored(ctx, messageId);
  return wordCandidates(ctx, message, conversation, members);
}

/** Who hears of a stored message, and as what. */
async function heardOf(ctx: Ctx, messageId: string) {
  const { conversation, members, message } = await stored(ctx, messageId);
  return listeners(ctx, message, conversation, members);
}

void test("a name or keyword is said whole, in any case", () => {
  assert.equal(saysWord("hey Maya Chen, look", "Maya Chen"), true);
  assert.equal(saysWord("MAYA CHEN!", "Maya Chen"), true);
  assert.equal(saysWord("@Maya Chen", "Maya Chen"), true);
  assert.equal(saysWord("ask maya", "Maya"), true);
  assert.equal(saysWord("the Mayans", "Maya"), false);
  assert.equal(saysWord("Maya Chenko", "Maya Chen"), false);
  assert.equal(saysWord("Maya", "Maya Chen"), false);
  assert.equal(saysWord("Zoë said", "Zoë"), true);
  assert.equal(saysWord("Zoëy said", "Zoë"), false);
  assert.equal(saysWord("J.R. is here", "J.R."), true);
  assert.equal(saysWord("JaR is here", "J.R."), false);
  assert.equal(saysWord("anything", "  "), false);
});

void test("a message may say the keywords of others, and the names of those who want them", async (t) => {
  const { ctx, say } = setup(t);
  await setNotificationSettings(ctx, LEO, {
    keywords: ["launch day", "deploy"],
    yourName: true,
  });
  await setNotificationSettings(ctx, ME, { yourName: true });
  await say(MAYA, "deploy");
  // A keyword settles it; a name still needs checking.
  assert.deepEqual(await candidatesOf(ctx, "deploy"), {
    keywords: [{ accountId: LEO, keyword: "deploy" }],
    names: [ME],
  });
  await say(MAYA, "deployed");
  assert.deepEqual(await candidatesOf(ctx, "deployed"), {
    keywords: [],
    names: [ME, LEO],
  });
  // Never for your own message, nor anyone it @mentions.
  await say(LEO, "deploy now", undefined, {
    mentions: [{ accountId: ME, name: ME }],
  });
  assert.deepEqual(await candidatesOf(ctx, "deploy now"), {
    keywords: [],
    names: [],
  });
});

void test("once its words are noted, a message reaches them as a mention, once", async (t) => {
  const { ctx, say } = setup(t);
  await setAlerts(ctx, LEO, { alerts: "mentions", conversationId: GROUP });
  await say(MAYA, "hello");
  assert.deepEqual(await heardOf(ctx, "hello"), [
    { accountId: ME, reply: null },
  ]);
  await noteWordsSaid(ctx, "hello", [
    { accountId: LEO, said: { keyword: "hello", kind: "keyword" } },
    { accountId: ME, said: { kind: "name" } },
  ]);
  // Leo hears of it now, and Me, who hears of every message, still once.
  assert.deepEqual(await heardOf(ctx, "hello"), [
    { accountId: ME, reply: null },
    { accountId: LEO, reply: null },
  ]);
  // Its words are worked out once.
  assert.deepEqual(await candidatesOf(ctx, "hello"), {
    keywords: [],
    names: [],
  });
  // Not at none.
  await setAlerts(ctx, LEO, { alerts: "none", conversationId: GROUP });
  assert.deepEqual(await heardOf(ctx, "hello"), [
    { accountId: ME, reply: null },
  ]);
});

void test("a thread reply that says your name reaches you as a mention would", async (t) => {
  const { ctx, say } = setup(t);
  await say(ME, "root");
  await say(MAYA, "kept", "root", { threadOnly: true });
  await noteWordsSaid(ctx, "kept", [
    { accountId: LEO, said: { kind: "name" } },
  ]);
  assert.deepEqual(await heardOf(ctx, "kept"), [
    { accountId: ME, reply: "yours" },
    { accountId: LEO, reply: "thread" },
  ]);
});

void test("a message that says your words is in your activity as a mention", async (t) => {
  const { ctx, say } = setup(t);
  await say(MAYA, "first");
  await say(MAYA, "ramen");
  await noteWordsSaid(ctx, "ramen", [
    { accountId: LEO, said: { keyword: "Ramen", kind: "keyword" } },
  ]);
  const items = await activity(ctx, LEO, { mentions: true, threads: true });
  const mention = items.find((item) => item.kind === "mention");
  assert.equal(mention?.kind, "mention");
  assert.equal(mention.message.messageId, "ramen");
  assert.deepEqual(mention.said, { keyword: "Ramen", kind: "keyword" });
  // It leaves the conversation's item, so it's there once.
  const messages = items.find((item) => item.kind === "messages");
  assert.equal(messages?.kind === "messages" && messages.count, 1);
  // Nobody else's.
  const mine = await activity(ctx, ME, { mentions: true, threads: true });
  assert.equal(
    mine.some((item) => item.kind === "mention"),
    false,
  );
});

void test("keywords are kept trimmed, once each, and within limits", async () => {
  const { ctx } = fakeCtx({});
  await setNotificationSettings(ctx, ME, {
    keywords: ["  launch   day ", "Deploy", "deploy", ""],
  });
  assert.deepEqual((await notificationSettings(ctx, ME)).keywords, [
    "launch day",
    "Deploy",
  ]);
  await assert.rejects(
    setNotificationSettings(ctx, ME, { keywords: ["x".repeat(51)] }),
  );
  await assert.rejects(
    setNotificationSettings(ctx, ME, {
      keywords: Array.from({ length: 51 }, (_, index) => `word ${index}`),
    }),
  );
});
