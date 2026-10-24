import assert from "node:assert/strict";
import test from "node:test";

import { setAlerts } from "./alerts.ts";
import { listeners, nameListeners } from "./listeners.ts";
import { saysName } from "./mentions.ts";
import { setNotificationSettings } from "./settings.ts";
import { GROUP, LEO, MAYA, ME, setup } from "./threads.testing.ts";

/** Who would hear of a stored message only if it says their name. */
async function namedOf(
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
  return nameListeners(ctx, message, conversation, members, heard);
}

void test("a name is said whole, in any case", () => {
  assert.equal(saysName("hey Maya Chen, look", "Maya Chen"), true);
  assert.equal(saysName("MAYA CHEN!", "Maya Chen"), true);
  assert.equal(saysName("@Maya Chen", "Maya Chen"), true);
  assert.equal(saysName("ask maya", "Maya"), true);
  assert.equal(saysName("the Mayans", "Maya"), false);
  assert.equal(saysName("Maya Chenko", "Maya Chen"), false);
  assert.equal(saysName("Maya", "Maya Chen"), false);
  assert.equal(saysName("Zoë said", "Zoë"), true);
  assert.equal(saysName("Zoëy said", "Zoë"), false);
  assert.equal(saysName("J.R. is here", "J.R."), true);
  assert.equal(saysName("JaR is here", "J.R."), false);
  assert.equal(saysName("anything", "  "), false);
});

void test("only those who turned it on would hear of their name", async (t) => {
  const { ctx, say } = setup(t);
  await setAlerts(ctx, ME, { alerts: "mentions", conversationId: GROUP });
  await setAlerts(ctx, LEO, { alerts: "mentions", conversationId: GROUP });
  await setNotificationSettings(ctx, LEO, { yourName: true });
  await say(MAYA, "hello");
  assert.deepEqual(await namedOf(ctx, "hello"), [
    { accountId: LEO, reply: null },
  ]);
  // Never for your own message.
  await say(LEO, "mine");
  assert.deepEqual(await namedOf(ctx, "mine"), []);
});

void test("a message that reaches you anyway, or can't, isn't one", async (t) => {
  const { ctx, say } = setup(t);
  await setNotificationSettings(ctx, LEO, { yourName: true });
  await say(MAYA, "hello");
  // At all, it reaches Leo already.
  assert.deepEqual(await namedOf(ctx, "hello"), []);
  // At none, it never does.
  await setAlerts(ctx, LEO, { alerts: "none", conversationId: GROUP });
  assert.deepEqual(await namedOf(ctx, "hello"), []);
  // Nor with pushes off.
  await setAlerts(ctx, LEO, { alerts: "mentions", conversationId: GROUP });
  await setNotificationSettings(ctx, LEO, { enabled: false });
  assert.deepEqual(await namedOf(ctx, "hello"), []);
});

void test("a thread reply that says your name reaches you as a mention would", async (t) => {
  const { ctx, say } = setup(t);
  await setNotificationSettings(ctx, LEO, { yourName: true });
  await say(ME, "root");
  await say(MAYA, "kept", "root", { threadOnly: true });
  assert.deepEqual(await namedOf(ctx, "kept"), [
    { accountId: LEO, reply: "thread" },
  ]);
});
