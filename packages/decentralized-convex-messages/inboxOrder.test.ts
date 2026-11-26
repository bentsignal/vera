import assert from "node:assert/strict";
import test from "node:test";

import { conversation, FRIEND, ME, message, NOW } from "./badges.testing.ts";
import {
  addGroupMembers,
  createGroup,
  leaveConversation,
} from "./conversations.ts";
import { fakeCtx } from "./fakeCtx.ts";
import {
  addChannelBatch,
  JOIN_BATCH,
  joinBatch,
  leaveBatch,
} from "./inboxMembers.ts";
import {
  BIG_BUMP_COOLDOWN_MS,
  BUMP_BATCH,
  bumpConversation,
  continueBump,
} from "./inboxOrder.ts";
import { findAccess, toConversation } from "./model.ts";
import { SPACE_PAGE_SIZE } from "./protocol.ts";
import { send } from "./sending.ts";
import { space, spaceMembers } from "./spaceQueries.ts";

// Keeping each account's inbox order (`inboxEntries`) without sends
// writing it, and with every job a batch at a time however big a space is.

const CHANNEL = "channel:big";
const SPACE = "space:big";

/** A channel in a space of `count` people, each with a row for it. */
function bigChannel(count: number) {
  const people = Array.from({ length: count }, (_, index) =>
    index === 0 ? ME : `person${String(index).padStart(5, "0")}@vera.chat`,
  );
  return fakeCtx({
    conversations: [
      { ...conversation(CHANNEL, "channel", SPACE), updatedAt: 1 },
    ],
    inboxEntries: people.map((accountId) => ({
      accountId,
      activityAt: 1,
      conversationId: CHANNEL,
      section: "channels",
      spaceId: SPACE,
    })),
    messages: [message(CHANNEL, FRIEND, NOW)],
    spaceMembers: people.map((accountId) => ({
      accountId,
      role: accountId === ME ? "owner" : "member",
      spaceId: SPACE,
    })),
    spaces: [{ createdBy: ME, name: "Big", spaceId: SPACE }],
  });
}

void test("a send writes nobody's inbox row; it moves up a moment later", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const fake = bigChannel(3);
  const before = fake.writes().length;
  await send(fake.ctx, ME, "Me", {
    attachments: [],
    body: "hello",
    conversationId: CHANNEL,
    messageId: "m1",
  });
  const writes = fake.writes().slice(before);
  assert.ok(!writes.some((write) => write.startsWith("inboxEntries")));
  assert.ok(
    fake
      .scheduled()
      .some(
        ({ args }) =>
          JSON.stringify(args) === JSON.stringify({ conversationId: CHANNEL }),
      ),
  );
});

void test("a big channel moves up a batch per run, then waits during a burst", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const count = BUMP_BATCH * 2 + 50;
  const fake = bigChannel(count);
  await bumpConversation(fake.ctx, CHANNEL);
  function raised() {
    return fake.rows("inboxEntries").filter((row) => row.activityAt === NOW)
      .length;
  }
  assert.equal(raised(), BUMP_BATCH);
  // A second bump while a pass is under way does nothing.
  await bumpConversation(fake.ctx, CHANNEL);
  assert.equal(raised(), BUMP_BATCH);
  await continueBump(fake.ctx, CHANNEL);
  assert.equal(raised(), BUMP_BATCH * 2);
  // A message arrives before the last batch.
  await fake.ctx.db.insert("messages", message(CHANNEL, FRIEND, NOW + 5));
  await continueBump(fake.ctx, CHANNEL);
  assert.equal(raised(), count);
  const state = fake.rows("inboxBumps")[0];
  assert.ok(state !== undefined);
  assert.equal(state.through, NOW);
  assert.equal(state.target, undefined);
  // The next pass waits, since this channel took more than one run.
  assert.equal(fake.scheduled().at(-1)?.delay, BIG_BUMP_COOLDOWN_MS);
  // Nothing new: nothing to do.
  const writes = fake.writes().length;
  await fake.patchRow(state._id, { through: NOW + 5 });
  await bumpConversation(fake.ctx, CHANNEL);
  assert.equal(fake.writes().length, writes + 1);
});

void test("joining a space with many channels adds their rows a batch at a time", async () => {
  const channels = Array.from({ length: JOIN_BATCH + 30 }, (_, index) =>
    conversation(`channel:${index}`, "channel", SPACE),
  );
  const fake = fakeCtx({
    conversations: channels,
    spaceMembers: [{ accountId: ME, role: "member", spaceId: SPACE }],
  });
  const next = await joinBatch(fake.ctx, SPACE, ME, undefined);
  assert.equal(fake.rows("inboxEntries").length, JOIN_BATCH);
  assert.notEqual(next, undefined);
  assert.equal(await joinBatch(fake.ctx, SPACE, ME, next), undefined);
  assert.equal(fake.rows("inboxEntries").length, JOIN_BATCH + 30);
  // Leaving takes them all out, unless they're back in the space.
  for (const row of fake.rows("spaceMembers")) await fake.deleteRow(row._id);
  await leaveBatch(fake.ctx, SPACE, ME);
  assert.equal(fake.rows("inboxEntries").length, 0);
});

void test("a new channel is listed for its space's members a batch at a time", async () => {
  const fake = bigChannel(250);
  for (const row of fake.rows("inboxEntries")) await fake.deleteRow(row._id);
  await addChannelBatch(fake.ctx, CHANNEL, undefined);
  assert.equal(fake.rows("inboxEntries").length, 200);
  const last = fake.scheduled().at(-1)?.args;
  assert.deepEqual(last, {
    after: "person00199@vera.chat",
    conversationId: CHANNEL,
  });
  await addChannelBatch(fake.ctx, CHANNEL, "person00199@vera.chat");
  assert.equal(fake.rows("inboxEntries").length, 250);
});

void test("groups list in their members' inboxes as people join and leave", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const fake = fakeCtx({});
  const { conversationId } = await createGroup(fake.ctx, ME, {
    members: [FRIEND],
  });
  function owners() {
    return fake
      .rows("inboxEntries")
      .map((row) => String(row.accountId))
      .sort();
  }
  assert.deepEqual(owners(), [FRIEND, ME]);
  await addGroupMembers(fake.ctx, ME, {
    conversationId,
    members: ["leo@vera.chat"],
  });
  assert.deepEqual(owners(), [FRIEND, "leo@vera.chat", ME]);
  await leaveConversation(fake.ctx, FRIEND, { conversationId });
  assert.deepEqual(owners(), ["leo@vera.chat", ME]);
});

void test("a channel's row carries no member list, however big its space", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const fake = bigChannel(2_000);
  const access = await findAccess(fake.ctx, CHANNEL, ME);
  assert.ok(access !== null);
  const before = fake.documentsRead();
  const row = await toConversation(fake.ctx, access, ME, "all");
  assert.deepEqual(row.members, []);
  assert.ok(fake.documentsRead() - before < 50);
});

/** How many members `spaceMembers` pages through after `after`. */
async function countMembers(
  fake: ReturnType<typeof fakeCtx>,
  start: string | undefined,
) {
  let after = start ?? null;
  let total = 0;
  while (after !== null) {
    const page = await spaceMembers(fake.ctx, ME, { after, spaceId: SPACE });
    total += page?.members.length ?? 0;
    after = page?.next ?? null;
  }
  return total;
}

void test("a space lists a page of its members and pages through the rest", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const fake = bigChannel(2_000);
  const before = fake.documentsRead();
  const found = await space(fake.ctx, ME, SPACE);
  assert.ok(fake.documentsRead() - before < 300);
  assert.ok(found !== null);
  assert.equal(found.members.length, SPACE_PAGE_SIZE);
  assert.equal(found.moreMembers, true);
  assert.equal(
    await countMembers(fake, found.members.at(-1)?.accountId),
    2_000 - SPACE_PAGE_SIZE,
  );
  // Someone outside the space reads none of it.
  assert.equal(
    await spaceMembers(fake.ctx, "stranger@vera.chat", { spaceId: SPACE }),
    null,
  );
});
