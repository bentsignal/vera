import assert from "node:assert/strict";
import test from "node:test";

import { activity } from "./activity.ts";
import {
  conversation,
  FRIEND,
  ME,
  member,
  message,
  NOW,
} from "./badges.testing.ts";
import { countBadge } from "./badges.ts";
import { fakeCtx } from "./fakeCtx.ts";
import { inbox, setPinned, setShowInInbox } from "./inbox.ts";
import { fillBatch, isFilled } from "./inboxFill.ts";
import { inboxPage } from "./inboxPages.ts";
import { inboxConversations } from "./inboxQueries.ts";
import { INBOX_PAGE_SIZE, LEGACY_INBOX_ROWS } from "./protocol.ts";

// The inbox read a page at a time from each account's rows
// (`inboxEntries`), and everything that lists an inbox kept small however
// many conversations it has (.plans/inbox-paging.md).

const FILLED = { done: true, key: "inboxFill" };

/** A group of ME's, `index` minutes old, with one unread message. */
function chat(index: number) {
  const id = `group:${index}`;
  const at = NOW - index * 60_000;
  return {
    conversation: { ...conversation(id, "group"), updatedAt: at - 1 },
    entry: {
      accountId: ME,
      activityAt: at,
      conversationId: id,
      section: "chats",
    },
    member: member(id, { lastReadAt: at - 1 }),
    message: message(id, FRIEND, at),
  };
}

/** ME in `count` groups, each with an unread message, newest first. */
function bigInbox(count: number, extra: Record<string, unknown[]> = {}) {
  const chats = Array.from({ length: count }, (_, index) => chat(index));
  return fakeCtx({
    conversations: chats.map((item) => item.conversation),
    inboxEntries: chats.map((item) => item.entry),
    members: chats.map((item) => item.member),
    messages: chats.map((item) => item.message),
    sequencing: [FILLED],
    ...extra,
  });
}

function clock(t: test.TestContext) {
  t.mock.method(Date, "now", () => NOW);
}

void test("pages through the inbox newest first, each conversation once", async () => {
  const fake = bigInbox(120);
  const first = await inboxPage(fake.ctx, ME, { channels: true });
  assert.equal(first.conversationIds.length, INBOX_PAGE_SIZE);
  assert.equal(first.conversationIds[0], "group:0");
  assert.notEqual(first.next, null);
  const second = await inboxPage(fake.ctx, ME, {
    before: first.next ?? undefined,
    channels: true,
  });
  const third = await inboxPage(fake.ctx, ME, {
    before: second.next ?? undefined,
    channels: true,
  });
  assert.equal(third.conversationIds.length, 20);
  assert.equal(third.next, null);
  const all = [
    ...first.conversationIds,
    ...second.conversationIds,
    ...third.conversationIds,
  ];
  assert.equal(new Set(all).size, 120);
  assert.deepEqual(
    all,
    Array.from({ length: 120 }, (_, index) => `group:${index}`),
  );
});

void test("a page never asks for more than a page", async () => {
  const fake = bigInbox(80);
  const page = await inboxPage(fake.ctx, ME, { limit: 10_000 });
  assert.equal(page.conversationIds.length, INBOX_PAGE_SIZE);
});

void test("a huge inbox reads a page, not every conversation", async () => {
  const fake = bigInbox(5_000);
  const before = fake.documentsRead();
  await inboxPage(fake.ctx, ME, { channels: true });
  const read = fake.documentsRead() - before;
  assert.ok(read < 400, `read ${read} documents`);
});

void test("older apps' inbox lists the newest and stays small", async (t) => {
  clock(t);
  const fake = bigInbox(5_000);
  const before = fake.documentsRead();
  const found = await inbox(fake.ctx, ME, { channels: true });
  assert.equal(found.length, LEGACY_INBOX_ROWS);
  assert.equal(found[0]?.conversationId, "group:0");
  await inboxConversations(fake.ctx, ME, { channels: true });
  assert.ok(fake.documentsRead() - before < 3_000);
});

void test("pins come first, on the first page only, and not again", async (t) => {
  clock(t);
  const fake = bigInbox(120);
  await setPinned(fake.ctx, ME, { conversationId: "group:90", pinned: true });
  const first = await inboxPage(fake.ctx, ME, { channels: true });
  assert.deepEqual(first.pinned, ["group:90"]);
  assert.ok(!first.conversationIds.includes("group:90"));
  let before = first.next;
  const rest: string[] = [];
  while (before !== null) {
    const page = await inboxPage(fake.ctx, ME, { before, channels: true });
    assert.deepEqual(page.pinned, []);
    rest.push(...page.conversationIds);
    before = page.next;
  }
  assert.ok(!rest.includes("group:90"));
  await setPinned(fake.ctx, ME, { conversationId: "group:90", pinned: false });
  assert.deepEqual(
    (await inboxPage(fake.ctx, ME, { channels: true })).pinned,
    [],
  );
});

void test("a channel left out of the inbox isn't listed", async (t) => {
  clock(t);
  const fake = fakeCtx({
    conversations: [
      { ...conversation("channel:a", "channel", "space:a"), updatedAt: NOW },
      { ...conversation("group:a", "group"), updatedAt: NOW - 5 },
    ],
    inboxEntries: [
      {
        accountId: ME,
        activityAt: NOW,
        conversationId: "channel:a",
        section: "channels",
        spaceId: "space:a",
      },
      {
        accountId: ME,
        activityAt: NOW - 5,
        conversationId: "group:a",
        section: "chats",
      },
    ],
    members: [member("group:a")],
    sequencing: [FILLED],
    spaceMembers: [{ accountId: ME, role: "member", spaceId: "space:a" }],
    spaces: [{ createdBy: FRIEND, name: "Space", spaceId: "space:a" }],
  });
  assert.deepEqual(
    (await inboxPage(fake.ctx, ME, { channels: true })).conversationIds,
    ["channel:a", "group:a"],
  );
  assert.deepEqual((await inboxPage(fake.ctx, ME, {})).conversationIds, [
    "group:a",
  ]);
  await setShowInInbox(fake.ctx, ME, {
    conversationId: "channel:a",
    show: false,
  });
  assert.deepEqual(
    (await inboxPage(fake.ctx, ME, { channels: true })).conversationIds,
    ["group:a"],
  );
});

void test("the badge counts the pins and the first page, however big the inbox", async (t) => {
  clock(t);
  const fake = bigInbox(3_000);
  const before = fake.documentsRead();
  const { count, rows } = await countBadge(fake.ctx, ME, {}, ["chats"]);
  const read = fake.documentsRead() - before;
  assert.equal(rows.length, INBOX_PAGE_SIZE);
  assert.ok(count >= INBOX_PAGE_SIZE);
  assert.ok(read < 3_000, `read ${read} documents`);
});

void test("activity looks at the newest conversations, however many there are", async (t) => {
  clock(t);
  const fake = bigInbox(3_000);
  const before = fake.documentsRead();
  const items = await activity(fake.ctx, ME, {}, { counting: true });
  const read = fake.documentsRead() - before;
  assert.ok(items.length <= 100);
  assert.ok(read < 3_000, `read ${read} documents`);
});

void test("an inbox lists every conversation until its rows are filled in", async () => {
  const chats = Array.from({ length: 3 }, (_, index) => chat(index));
  const fake = fakeCtx({
    conversations: chats.map((item) => item.conversation),
    members: chats.map((item) => item.member),
    messages: chats.map((item) => item.message),
    sequencing: [{ done: false, key: "inboxFill" }],
  });
  assert.equal(await isFilled(fake.ctx), false);
  assert.deepEqual(
    (await inboxPage(fake.ctx, ME, { channels: true })).conversationIds,
    ["group:0", "group:1", "group:2"],
  );
  let step = await fillBatch(fake.ctx, "members", null);
  while (step !== null) {
    step = await fillBatch(fake.ctx, step.phase, step.cursor);
  }
  assert.equal(await isFilled(fake.ctx), true);
  assert.equal(fake.rows("inboxEntries").length, 3);
  assert.deepEqual(
    (await inboxPage(fake.ctx, ME, { channels: true })).conversationIds,
    ["group:0", "group:1", "group:2"],
  );
});
