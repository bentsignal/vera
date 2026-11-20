import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";

import type { MutationCtx } from "./_generated/server.js";
import type { InboxKind } from "./protocol.ts";
import { BADGE_REUSE_MS, badgeFor, settleBadge } from "./badgeCache.ts";
import { busyAccount, FRIEND, ME, message, NOW } from "./badges.testing.ts";
import { countBadge } from "./badges.ts";
import { markRead } from "./conversations.ts";
import { fakeCtx } from "./fakeCtx.ts";

const INBOX: readonly InboxKind[] = ["chats", "channels", "threads"];
const SHOWS = { mentions: true, threads: true };
const KEY = "threads chats,channels,threads";

/** The badge counted afresh, as a push without a saved one would. */
async function fresh(ctx: MutationCtx) {
  return (await countBadge(ctx, ME, SHOWS, INBOX)).count;
}

/** A push's badge, the way `badgeOf` gets it (see delivery.ts). */
async function pushBadge(ctx: MutationCtx, messageId?: string) {
  for (let tries = 0; ; tries += 1) {
    const found = await badgeFor(ctx, {
      accountId: ME,
      inbox: INBOX,
      key: KEY,
      messageId: tries < 2 ? messageId : undefined,
      threads: true,
    });
    const saved = await settleBadge(ctx, ME, found.settle);
    if (saved || found.settle.fresh) return found.count;
  }
}

/** A push's badge, and how many documents getting it read. */
async function measured(
  ctx: MutationCtx,
  documentsRead: () => number,
  messageId?: string,
) {
  const before = documentsRead();
  const badge = await pushBadge(ctx, messageId);
  return { badge, documents: documentsRead() - before };
}

/** Someone sends a message to a conversation the account is in. */
async function sent(
  ctx: MutationCtx,
  conversationId: string,
  extra: Record<string, unknown> = {},
) {
  const row = message(conversationId, FRIEND, Date.now(), extra);
  await ctx.db.insert("messages", row);
  return row.messageId;
}

/** The account reads a conversation. */
async function read(ctx: MutationCtx, conversationId: string) {
  await markRead(ctx, ME, { conversationId, readAt: Date.now() });
}

function at(t: TestContext) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
}

/**
 * Two pushes to the account: the first finds nothing saved and saves
 * nothing (nothing forgot its changes before it), the second saves its
 * count for the pushes after. Resolves to the second's badge.
 */
async function warm(t: TestContext, ctx: MutationCtx) {
  t.mock.timers.tick(100);
  await pushBadge(ctx, await sent(ctx, "group:9"));
  t.mock.timers.tick(100);
  return pushBadge(ctx, await sent(ctx, "group:9"));
}

void test("a burst's pushes read a few documents each, with the badge exact", async (t) => {
  at(t);
  const { ctx, documentsRead } = fakeCtx(busyAccount());
  const perPush: number[] = [];
  const counted: number[] = [];
  for (let index = 0; index < 10; index += 1) {
    t.mock.timers.tick(150);
    const messageId = await sent(ctx, "group:9");
    const before = documentsRead();
    const badge = await pushBadge(ctx, messageId);
    perPush.push(documentsRead() - before);
    const beforeFresh = documentsRead();
    assert.equal(badge, await fresh(ctx));
    counted.push(documentsRead() - beforeFresh);
  }
  const [first = 0, second = 0, ...rest] = perPush;
  t.diagnostic(`counting afresh: ${counted.join(", ")} documents`);
  t.diagnostic(
    `pushes: ${first}, ${second}, then ${rest.join(", ")} documents`,
  );
  // The first two count it (the second saves it); the rest build on it.
  // Messages too new to be numbered yet are read one by one (see
  // `unreadCount`), so that grows through the burst, as counting afresh
  // does.
  assert.ok(first >= Math.min(...counted));
  assert.ok(second >= Math.min(...counted));
  rest.forEach((reads, index) => {
    assert.ok(reads <= 10 + index, `${reads} documents`);
  });
});

void test("pushes out of order count their message once", async (t) => {
  at(t);
  const { ctx } = fakeCtx(busyAccount());
  await warm(t, ctx);
  t.mock.timers.tick(100);
  const first = await sent(ctx, "group:9");
  t.mock.timers.tick(100);
  const second = await sent(ctx, "group:9");
  // The second message's push counts both; the first's comes after.
  assert.equal(await pushBadge(ctx, second), await fresh(ctx));
  assert.equal(await pushBadge(ctx, first), await fresh(ctx));
  // And across conversations: each push is exact up to its own message
  // (one whose push hasn't come yet isn't counted), so the last is exact.
  t.mock.timers.tick(100);
  const elsewhere = await sent(ctx, "direct:0");
  t.mock.timers.tick(100);
  const here = await sent(ctx, "group:9");
  assert.equal(await pushBadge(ctx, here), (await fresh(ctx)) - 1);
  assert.equal(await pushBadge(ctx, elsewhere), await fresh(ctx));
});

void test("reading between pushes counts afresh", async (t) => {
  at(t);
  const { ctx, documentsRead } = fakeCtx(busyAccount());
  const badge = await warm(t, ctx);
  t.mock.timers.tick(100);
  // Read somewhere else: the next push in the window mustn't keep it.
  await read(ctx, "direct:0");
  t.mock.timers.tick(100);
  const next = await sent(ctx, "group:9");
  const { badge: after, documents } = await measured(ctx, documentsRead, next);
  assert.equal(after, await fresh(ctx));
  // direct:0's two unread messages are gone, the new one counts.
  assert.equal(after, badge + 1 - 2);
  assert.ok(documents > 50, "counted afresh");
});

void test("a read while a count is under way keeps it from being saved", async (t) => {
  at(t);
  const { ctx, documentsRead } = fakeCtx(busyAccount());
  await warm(t, ctx);
  // Past the window, so the next push counts afresh.
  t.mock.timers.tick(BADGE_REUSE_MS);
  const messageId = await sent(ctx, "group:9");
  const found = await badgeFor(ctx, {
    accountId: ME,
    inbox: INBOX,
    key: KEY,
    messageId,
    threads: true,
  });
  assert.ok(found.settle.fresh && found.settle.live);
  // Read after the count read everything, before it's saved.
  await read(ctx, "direct:0");
  assert.equal(await settleBadge(ctx, ME, found.settle), false);
  t.mock.timers.tick(100);
  const next = await sent(ctx, "group:9");
  const pushed = await measured(ctx, documentsRead, next);
  assert.equal(pushed.badge, await fresh(ctx));
  assert.ok(pushed.documents > 50, "counted afresh");
});

void test("a count from before anything was saved isn't saved", async (t) => {
  at(t);
  const { ctx, documentsRead } = fakeCtx(busyAccount());
  t.mock.timers.tick(100);
  const found = await badgeFor(ctx, {
    accountId: ME,
    inbox: INBOX,
    key: KEY,
    messageId: await sent(ctx, "group:9"),
    threads: true,
  });
  assert.ok(!found.settle.live);
  // Nothing was saved, so this read forgets nothing.
  await read(ctx, "direct:0");
  assert.equal(await settleBadge(ctx, ME, found.settle), false);
  t.mock.timers.tick(100);
  const next = await sent(ctx, "group:9");
  const pushed = await measured(ctx, documentsRead, next);
  assert.equal(pushed.badge, await fresh(ctx));
  assert.ok(pushed.documents > 50, "counted afresh");
});

void test("after the window, the next push counts afresh", async (t) => {
  at(t);
  const { ctx, documentsRead } = fakeCtx(busyAccount());
  await warm(t, ctx);
  t.mock.timers.tick(BADGE_REUSE_MS);
  const next = await sent(ctx, "group:9");
  const pushed = await measured(ctx, documentsRead, next);
  assert.equal(pushed.badge, await fresh(ctx));
  assert.ok(pushed.documents > 50, "counted afresh");
});

void test("what a message can't be told to change counts afresh", async (t) => {
  at(t);
  const { ctx, documentsRead } = fakeCtx(busyAccount());
  await warm(t, ctx);
  const cases: [string, Record<string, unknown>][] = [
    // A mention at Mentions: Activity counts it, not its row.
    ["group:3", { mentions: [{ accountId: ME, name: "Me" }] }],
    // A channel's mention of you is an Activity item of its own.
    ["channel:space:a:0", { mentions: [{ accountId: ME, name: "Me" }] }],
    // A thread reply changes the thread's count.
    ["group:1", { threadId: "group:1:x", threadOnly: true }],
    // A reply shown in the conversation is Activity's too.
    [
      "group:9",
      { quote: { authorId: ME, messageId: "x" }, threadId: "group:9:x" },
    ],
  ];
  for (const [conversationId, extra] of cases) {
    t.mock.timers.tick(10);
    const messageId = await sent(ctx, conversationId, extra);
    const pushed = await measured(ctx, documentsRead, messageId);
    assert.equal(pushed.badge, await fresh(ctx));
    assert.ok(pushed.documents > 50, `${conversationId} afresh`);
  }
  // A channel's message that doesn't mention you builds on it.
  t.mock.timers.tick(10);
  const plain = await sent(ctx, "channel:space:a:1");
  const pushed = await measured(ctx, documentsRead, plain);
  assert.equal(pushed.badge, await fresh(ctx));
  assert.ok(pushed.documents <= 14, `built on: ${pushed.documents}`);
});

void test("a push about something else counts afresh and saves it", async (t) => {
  at(t);
  const { ctx, documentsRead } = fakeCtx(busyAccount());
  await warm(t, ctx);
  // A reaction to your message: its push has no message to build on.
  t.mock.timers.tick(100);
  await ctx.db.insert("reactions", {
    accountId: FRIEND,
    conversationId: "group:11",
    emoji: "🎉",
    messageAuthorId: ME,
    messageId: "group:9:mine",
    reactedAt: Date.now(),
  });
  assert.equal(await pushBadge(ctx), await fresh(ctx));
  t.mock.timers.tick(100);
  const next = await sent(ctx, "direct:0");
  const pushed = await measured(ctx, documentsRead, next);
  assert.equal(pushed.badge, await fresh(ctx));
  assert.ok(pushed.documents <= 14, `built on: ${pushed.documents}`);
});
