import assert from "node:assert/strict";
import test from "node:test";

import { setAlerts } from "./alerts.ts";
import { fakeCtx } from "./fakeCtx.ts";
import { listeners, wordListeners } from "./listeners.ts";
import { saysWord } from "./mentions.ts";
import { notificationSettings, setNotificationSettings } from "./settings.ts";
import { GROUP, LEO, MAYA, ME, setup } from "./threads.testing.ts";

/**
 * Who would hear of a stored message only because it says their keyword,
 * or if it says their name.
 */
async function wordsOf(
  ctx: ReturnType<typeof setup>["ctx"],
  messageId: string,
) {
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
  const members = [ME, MAYA, LEO];
  const heard = await listeners(ctx, message, conversation, members);
  return wordListeners(ctx, message, conversation, members, heard);
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

void test("only those who turned it on would hear of their name", async (t) => {
  const { ctx, say } = setup(t);
  await setAlerts(ctx, ME, { alerts: "mentions", conversationId: GROUP });
  await setAlerts(ctx, LEO, { alerts: "mentions", conversationId: GROUP });
  await setNotificationSettings(ctx, LEO, { yourName: true });
  await say(MAYA, "hello");
  assert.deepEqual((await wordsOf(ctx, "hello")).name, [
    { accountId: LEO, reply: null },
  ]);
  // Never for your own message.
  await say(LEO, "mine");
  assert.deepEqual((await wordsOf(ctx, "mine")).name, []);
});

void test("a message that reaches you anyway, or can't, isn't one", async (t) => {
  const { ctx, say } = setup(t);
  await setNotificationSettings(ctx, LEO, { yourName: true });
  await say(MAYA, "hello");
  // At all, it reaches Leo already.
  assert.deepEqual((await wordsOf(ctx, "hello")).name, []);
  // At none, it never does.
  await setAlerts(ctx, LEO, { alerts: "none", conversationId: GROUP });
  assert.deepEqual((await wordsOf(ctx, "hello")).name, []);
  // Nor with pushes off.
  await setAlerts(ctx, LEO, { alerts: "mentions", conversationId: GROUP });
  await setNotificationSettings(ctx, LEO, { enabled: false });
  assert.deepEqual((await wordsOf(ctx, "hello")).name, []);
});

void test("a thread reply that says your name reaches you as a mention would", async (t) => {
  const { ctx, say } = setup(t);
  await setNotificationSettings(ctx, LEO, { yourName: true });
  await say(ME, "root");
  await say(MAYA, "kept", "root", { threadOnly: true });
  assert.deepEqual((await wordsOf(ctx, "kept")).name, [
    { accountId: LEO, reply: "thread" },
  ]);
});

void test("a message that says your keyword reaches you as a mention would", async (t) => {
  const { ctx, say } = setup(t);
  await setAlerts(ctx, LEO, { alerts: "mentions", conversationId: GROUP });
  await setNotificationSettings(ctx, LEO, {
    keywords: ["launch day", "deploy"],
    yourName: true,
  });
  await say(MAYA, "deploy");
  // A keyword settles it here; a name still needs checking.
  assert.deepEqual(await wordsOf(ctx, "deploy"), {
    keyword: [{ accountId: LEO, reply: null }],
    name: [],
  });
  await say(MAYA, "deployed");
  assert.deepEqual(await wordsOf(ctx, "deployed"), {
    keyword: [],
    name: [{ accountId: LEO, reply: null }],
  });
  // Not at none.
  await setAlerts(ctx, LEO, { alerts: "none", conversationId: GROUP });
  assert.deepEqual((await wordsOf(ctx, "deploy")).keyword, []);
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
