import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";

import { markRead } from "./conversations.ts";
import { fakeCtx } from "./fakeCtx.ts";
import { inbox } from "./inbox.ts";
import { pageIncludes } from "./includes.ts";
import { react, reactions } from "./reactions.ts";
import { send } from "./sending.ts";
import { threadSummaries } from "./threads.ts";

// A busy conversation: many people sending at once must not write the
// same documents (they'd conflict, and a slow send could lose every
// retry), and a message must only rerun the queries whose results it
// changes.

const MAYA = "maya@vera.chat";
const LEO = "leo@vera.chat";
const GROUP = "group:vera.chat:1";
const OTHER = "group:vera.chat:2";

function at(t: TestContext, now: number) {
  t.mock.timers.enable({ apis: ["Date"], now });
}

function groups() {
  return fakeCtx({
    conversations: [GROUP, OTHER].map((conversationId) => ({
      conversationId,
      createdBy: MAYA,
      kind: "group",
      updatedAt: 0,
    })),
    members: [GROUP, OTHER].flatMap((conversationId) =>
      [MAYA, LEO].map((accountId) => ({
        accountId,
        conversationId,
        lastReadAt: 0,
        muted: false,
        role: accountId === MAYA ? "owner" : "member",
      })),
    ),
  });
}

function say(
  fake: ReturnType<typeof groups>,
  self: string,
  messageId: string,
  conversationId = GROUP,
) {
  return send(fake.ctx, self, self, {
    attachments: [],
    body: messageId,
    conversationId,
    messageId,
  });
}

void test("a send writes only its own rows, never the conversation or its members", async (t) => {
  at(t, 1_000);
  const fake = groups();
  await say(fake, MAYA, "hi");
  t.mock.timers.tick(10);
  await say(fake, MAYA, "again");
  assert.deepEqual(fake.writes(), [
    "messages insert",
    "readStates insert",
    "messages insert",
    "readStates patch",
  ]);
});

void test("the inbox orders and dates conversations by their newest message", async (t) => {
  at(t, 1_000);
  const fake = groups();
  await say(fake, MAYA, "first", OTHER);
  t.mock.timers.tick(1_000);
  await say(fake, MAYA, "second", GROUP);
  const listed = await inbox(fake.ctx, LEO, {});
  assert.deepEqual(
    listed.map(({ changedAt, conversationId, updatedAt }) => [
      conversationId,
      updatedAt,
      changedAt,
    ]),
    [
      [GROUP, 2_000, 2_000],
      [OTHER, 1_000, 1_000],
    ],
  );
});

void test("a reaction marks the conversation changed without writing it", async (t) => {
  at(t, 1_000);
  const fake = groups();
  await say(fake, MAYA, "hi");
  t.mock.timers.tick(500);
  const before = fake.writes().length;
  await react(fake.ctx, LEO, LEO, {
    conversationId: GROUP,
    emoji: "👍",
    messageId: "hi",
    on: true,
  });
  assert.deepEqual(fake.writes().slice(before), [
    "reactions insert",
    "conversationChanges insert",
  ]);
  const [listed] = await inbox(fake.ctx, LEO, {});
  assert.equal(listed?.changedAt, 1_500);
  // A reaction isn't a message: the conversation doesn't move up.
  assert.equal(listed.updatedAt, 1_000);
});

void test("reading writes only the reader's read state", async (t) => {
  at(t, 1_000);
  const fake = groups();
  await say(fake, MAYA, "one");
  await say(fake, MAYA, "two");
  async function unread() {
    const listed = await inbox(fake.ctx, LEO, {});
    return listed.find((item) => item.conversationId === GROUP)?.unreadCount;
  }
  assert.equal(await unread(), 2);
  const before = fake.writes().length;
  await markRead(fake.ctx, LEO, { conversationId: GROUP, readAt: 1_000 });
  assert.deepEqual(
    fake
      .writes()
      .slice(before)
      .filter((write) => !write.startsWith("activitySightings")),
    ["readStates insert"],
  );
  assert.equal(await unread(), 0);
  // Reading back to an earlier time doesn't unread anything.
  await markRead(fake.ctx, LEO, { conversationId: GROUP, readAt: 10 });
  assert.equal(await unread(), 0);
});

void test("sending marks what came before it read", async (t) => {
  at(t, 1_000);
  const fake = groups();
  await say(fake, LEO, "question");
  t.mock.timers.tick(10);
  await say(fake, MAYA, "answer");
  const [listed] = await inbox(fake.ctx, MAYA, {});
  assert.equal(listed?.unreadCount, 0);
});

void test("how far someone read before read states still counts", async (t) => {
  at(t, 5_000);
  const fake = fakeCtx({
    conversations: [
      { conversationId: GROUP, createdBy: MAYA, kind: "group", updatedAt: 0 },
    ],
    members: [
      {
        accountId: LEO,
        conversationId: GROUP,
        lastReadAt: 2_000,
        muted: false,
        role: "member",
      },
    ],
    messages: [1_000, 3_000].map((sentAt) => ({
      attachments: [],
      authorId: MAYA,
      authorName: MAYA,
      body: "",
      conversationId: GROUP,
      messageId: String(sentAt),
      sentAt,
    })),
  });
  const [listed] = await inbox(fake.ctx, LEO, {});
  assert.equal(listed?.unreadCount, 1);
});

void test("reactions and threads since a time cover the newest messages", async (t) => {
  at(t, 10_000);
  function reaction(messageId: string, reactedAt: number) {
    return {
      accountId: LEO,
      conversationId: GROUP,
      emoji: "👍",
      messageId,
      reactedAt,
    };
  }
  function thread(threadId: string, lastReplyAt: number) {
    return {
      conversationId: GROUP,
      lastReplyAt,
      replyCount: 1,
      repliers: [LEO],
      threadId,
    };
  }
  const { ctx } = fakeCtx({
    conversations: [
      { conversationId: GROUP, createdBy: MAYA, kind: "group", updatedAt: 0 },
    ],
    members: [MAYA, LEO].map((accountId) => ({
      accountId,
      conversationId: GROUP,
      lastReadAt: 0,
      muted: false,
      role: "member",
    })),
    reactions: [
      reaction("old", 1_000),
      reaction("new", 6_000),
      // An older message's reaction made since counts too.
      reaction("old", 7_000),
      { ...reaction("elsewhere", 8_000), conversationId: OTHER },
    ],
    threads: [thread("old", 2_000), thread("new", 6_500)],
  });
  const found = await reactions(ctx, MAYA, {
    conversationId: GROUP,
    since: 5_000,
  });
  assert.deepEqual(
    found.reactions.map(({ messageId, reactedAt }) => [messageId, reactedAt]),
    [
      ["old", 7_000],
      ["new", 6_000],
    ],
  );
  const summaries = await threadSummaries(ctx, MAYA, {
    conversationId: GROUP,
    since: 5_000,
  });
  assert.deepEqual(
    summaries.summaries.map(({ threadId }) => threadId),
    ["new"],
  );
  // Asking by message IDs works as before.
  const byId = await reactions(ctx, MAYA, {
    conversationId: GROUP,
    messageIds: ["new"],
  });
  assert.deepEqual(
    byId.reactions.map(({ reactedAt }) => reactedAt),
    [6_000],
  );
});

void test("a page of the newest messages includes reactions and threads since its cursor", async () => {
  const { ctx } = fakeCtx({});
  const included = await pageIncludes(ctx, GROUP, [], 5_000);
  assert.deepEqual(
    included.map(({ operation }) => operation),
    [
      { args: { conversationId: GROUP, since: 5_000 }, type: "reactions" },
      {
        args: { conversationId: GROUP, since: 5_000 },
        type: "threadSummaries",
      },
    ],
  );
});
