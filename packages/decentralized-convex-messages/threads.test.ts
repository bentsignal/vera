import assert from "node:assert/strict";
import test from "node:test";

import { activity } from "./activity.ts";
import { badgeCount } from "./badges.ts";
import { olderThan } from "./paging.ts";
import { seeConversationActivity } from "./sightings.ts";
import { GROUP, LEO, MAYA, ME, NOW, setup } from "./threads.testing.ts";
import {
  markThreadRead,
  setThreadFollowed,
  thread,
  threadState,
  threadSummaries,
} from "./threads.ts";

void test("from older apps, only a thread's first reply shows in the conversation", async (t) => {
  const { ctx, say } = setup(t);
  await say(ME, "root");
  const first = await say(MAYA, "first", "root");
  const second = await say(LEO, "second", "root");
  assert.equal(first.threadOnly, undefined);
  assert.equal(second.threadOnly, true);
  assert.deepEqual(first.quote, {
    attachment: undefined,
    authorId: ME,
    body: "root from me@vera.chat",
    messageId: "root",
  });

  const shown = await olderThan(ctx, { conversationId: GROUP }, undefined);
  assert.deepEqual(
    shown.messages.map(({ messageId }) => messageId),
    ["root", "first"],
  );
  const page = await thread(ctx, ME, {
    conversationId: GROUP,
    threadId: "root",
  });
  assert.equal(page.page.root?.messageId, "root");
  assert.deepEqual(
    page.page.messages.map(({ messageId }) => messageId),
    ["first", "second"],
  );
});

void test("the sender chooses whether a reply shows in the conversation", async (t) => {
  const { ctx, say } = setup(t);
  await say(ME, "root");
  // Sent in the thread, even as its first reply: it stays there.
  const kept = await say(MAYA, "kept", "root", { threadOnly: true });
  // Sent from the conversation, though the thread has replies: it shows.
  const shown = await say(LEO, "shown", "root", { threadOnly: false });
  assert.equal(kept.threadOnly, true);
  assert.equal(shown.threadOnly, undefined);

  const chat = await olderThan(ctx, { conversationId: GROUP }, undefined);
  assert.deepEqual(
    chat.messages.map(({ messageId }) => messageId),
    ["root", "shown"],
  );
  const page = await thread(ctx, ME, {
    conversationId: GROUP,
    threadId: "root",
  });
  assert.deepEqual(
    page.page.messages.map(({ messageId }) => messageId),
    ["kept", "shown"],
  );
  const { summaries } = await threadSummaries(ctx, ME, {
    conversationId: GROUP,
    messageIds: ["root"],
  });
  assert.equal(summaries[0]?.replyCount, 2);
});

void test("a reply to a reply goes to the original's thread, quoting the reply", async (t) => {
  const { say } = setup(t);
  await say(ME, "root");
  await say(MAYA, "first", "root");
  const nested = await say(LEO, "nested", "first");
  assert.equal(nested.threadId, "root");
  assert.equal(nested.threadOnly, true);
  assert.deepEqual(nested.quote, {
    attachment: undefined,
    authorId: MAYA,
    body: "first from maya@vera.chat",
    messageId: "first",
  });
});

void test("summarizes threads and tracks who's in them", async (t) => {
  const { ctx, say } = setup(t);
  await say(ME, "root");
  await say(MAYA, "first", "root");
  await say(LEO, "second", "root");
  await say(MAYA, "third", "root");
  const { summaries } = await threadSummaries(ctx, ME, {
    conversationId: GROUP,
    messageIds: ["root", "first"],
  });
  assert.deepEqual(summaries, [
    {
      lastReplyAt: NOW + 4 * 60_000,
      replyCount: 3,
      repliers: [MAYA, LEO],
      threadId: "root",
    },
  ]);
  // The original's author is in it without replying; others aren't.
  const state = await threadState(ctx, ME, {
    conversationId: GROUP,
    threadId: "root",
  });
  assert.deepEqual(state, { following: true, lastReadAt: NOW + 60_000 });
});

void test("activity lists replies after the first, until the thread is read", async (t) => {
  const { ctx, say } = setup(t);
  await say(ME, "root");
  await say(MAYA, "first", "root");
  await say(LEO, "second", "root");
  await say(MAYA, "third", "root");
  const items = await activity(ctx, ME, { threads: true });
  const item = items.find(({ kind }) => kind === "thread");
  assert.ok(item?.kind === "thread");
  assert.equal(item.count, 2);
  assert.deepEqual(item.authors, [MAYA, LEO]);
  assert.equal(item.root?.messageId, "root");
  // Apps from before threads don't ask for them.
  assert.equal(
    (await activity(ctx, ME)).some(({ kind }) => kind === "thread"),
    false,
  );

  await markThreadRead(ctx, ME, {
    conversationId: GROUP,
    readAt: item.at,
    threadId: "root",
  });
  const after = (await activity(ctx, ME, { threads: true })).find(
    ({ kind }) => kind === "thread",
  );
  assert.equal(after?.seenThrough, item.at);
});

void test("a thread's bell turns its activity off and back on", async (t) => {
  const { ctx, say } = setup(t);
  await say(ME, "root");
  await say(MAYA, "first", "root");
  await say(LEO, "second", "root");
  const args = { conversationId: GROUP, threadId: "root" };
  await setThreadFollowed(ctx, ME, { ...args, followed: false });
  assert.equal((await threadState(ctx, ME, args)).following, false);
  assert.equal(
    (await activity(ctx, ME, { threads: true })).some(
      ({ kind }) => kind === "thread",
    ),
    false,
  );
  await setThreadFollowed(ctx, ME, { ...args, followed: true });
  assert.equal((await threadState(ctx, ME, args)).following, true);
});

void test("anyone can follow a thread before it has replies", async (t) => {
  const { ctx, say } = setup(t);
  await say(MAYA, "root");
  const args = { conversationId: GROUP, threadId: "root" };
  assert.equal((await threadState(ctx, ME, args)).following, false);
  await setThreadFollowed(ctx, ME, { ...args, followed: true });
  assert.equal((await threadState(ctx, ME, args)).following, true);
});

void test("a reply must answer a message in its conversation", async (t) => {
  const { say } = setup(t);
  await assert.rejects(say(ME, "reply", "missing"), /MESSAGE_NOT_FOUND/);
});

void test("push badges count threads only for apps that show them", async (t) => {
  const { ctx, say } = setup(t);
  await say(ME, "root");
  await say(MAYA, "first", "root");
  await say(LEO, "second", "root");
  // The conversation's messages are one item; the thread is another.
  assert.equal(await badgeCount(ctx, ME, { threads: true }), 2);
  assert.equal(await badgeCount(ctx, ME, {}), 1);
});

void test("a mention in a thread reply is its own item, seen in the thread", async (t) => {
  const { ctx, say } = setup(t);
  await say(ME, "root");
  await say(MAYA, "first", "root");
  await say(LEO, "plain", "root");
  await say(LEO, "ping", "root", {
    mentions: [{ accountId: ME, name: "Me" }],
  });
  const shows = { mentions: true, threads: true };
  const items = await activity(ctx, ME, shows);
  const mention = items.find(({ kind }) => kind === "mention");
  assert.equal(mention?.key, "mention:ping");
  const replies = items.find(({ kind }) => kind === "thread");
  assert.equal(replies?.kind === "thread" && replies.count, 1);
  // Apps that can't open threads don't list it.
  assert.equal(
    (await activity(ctx, ME, { mentions: true })).some(
      ({ kind }) => kind === "mention",
    ),
    false,
  );

  // Reading the conversation doesn't see it; reading the thread does.
  await seeConversationActivity(ctx, ME, GROUP, Date.now());
  const unread = (await activity(ctx, ME, shows)).find(
    ({ kind }) => kind === "mention",
  );
  assert.equal(unread?.seenThrough, undefined);
  await markThreadRead(ctx, ME, {
    conversationId: GROUP,
    readAt: Date.now(),
    threadId: "root",
  });
  const read = (await activity(ctx, ME, shows)).find(
    ({ kind }) => kind === "mention",
  );
  assert.notEqual(read?.seenThrough, undefined);
});
