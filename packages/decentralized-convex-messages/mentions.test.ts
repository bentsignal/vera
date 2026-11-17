import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";

import { activity, isUnseen } from "./activity.ts";
import { setAlerts } from "./alerts.ts";
import { fakeCtx } from "./fakeCtx.ts";
import { recordMentions, validMentions } from "./mentions.ts";
import { requireAccess } from "./model.ts";
import { seeConversationActivity } from "./sightings.ts";

const ME = "me@vera.chat";
const MAYA = "maya@vera.chat";
const LEO = "leo@vera.chat";
const STRANGER = "stranger@vera.chat";
const VERA = "vera@vera.chat";
const HOUR = 60 * 60 * 1000;
const NOW = 30 * 24 * HOUR;

const mocked = new WeakSet<TestContext>();

/** Sets the clock, mocking it the first time in a test. */
function at(t: TestContext, now: number) {
  if (mocked.has(t)) {
    t.mock.timers.setTime(now);
    return;
  }
  mocked.add(t);
  t.mock.timers.enable({ apis: ["Date"], now });
}

function members(conversationId: string, accountIds: readonly string[]) {
  return accountIds.map((accountId) => ({
    accountId,
    conversationId,
    lastReadAt: 0,
    muted: false,
    role: "member",
  }));
}

function chats() {
  return fakeCtx({
    conversations: [
      {
        conversationId: "group:b",
        createdBy: MAYA,
        kind: "group",
        updatedAt: 0,
      },
      {
        conversationId: "direct:a",
        createdBy: MAYA,
        kind: "direct",
        updatedAt: 0,
      },
    ],
    members: [
      ...members("group:b", [ME, MAYA, LEO]),
      ...members("direct:a", [ME, MAYA]),
    ],
    assistants: [{ accountId: VERA }],
  });
}

/** What `send` stores of a message and its mentions. */
async function sendAs(
  ctx: ReturnType<typeof chats>["ctx"],
  author: string,
  body: string,
  wanted: { accountId: string; name: string }[],
  conversationId = "group:b",
) {
  const access = await requireAccess(ctx, conversationId, author);
  const mentions = await validMentions(ctx, access, author, body, wanted);
  const message = {
    attachments: [],
    authorId: author,
    authorName: author,
    body,
    conversationId,
    mentions,
    messageId: `${conversationId}:${Date.now()}:${body}`,
    sentAt: Date.now(),
  };
  await ctx.db.insert("messages", message);
  await recordMentions(ctx, message);
  return message;
}

void test("keeps mentions of members written in the body", async (t) => {
  at(t, NOW);
  const { ctx, rows } = chats();
  const message = await sendAs(ctx, MAYA, "@Me and @Leo, not @Stranger", [
    { accountId: ME, name: "Me" },
    { accountId: "LEO@vera.chat", name: "Leo" },
    // Not a member.
    { accountId: STRANGER, name: "Stranger" },
    // Not in the body.
    { accountId: LEO, name: "Leonard" },
    // The author.
    { accountId: MAYA, name: "Maya" },
    // Twice.
    { accountId: ME, name: "Me" },
  ]);
  assert.deepEqual(message.mentions, [
    { accountId: ME, name: "Me" },
    { accountId: LEO, name: "Leo" },
  ]);
  assert.deepEqual(
    rows("mentions").map(({ accountId }) => accountId),
    [ME, LEO],
  );
});

void test("direct messages have no mentions", async (t) => {
  at(t, NOW);
  const { ctx, rows } = chats();
  const message = await sendAs(
    ctx,
    MAYA,
    "@Me",
    [{ accountId: ME, name: "Me" }],
    "direct:a",
  );
  assert.equal(message.mentions, undefined);
  assert.equal(rows("mentions").length, 0);
});

void test("keeps mentions of assistants anywhere, members or not", async (t) => {
  at(t, NOW);
  const { ctx } = chats();
  const inGroup = await sendAs(ctx, MAYA, "@Vera what's this?", [
    { accountId: VERA, name: "Vera" },
    { accountId: STRANGER, name: "Vera" },
  ]);
  assert.deepEqual(inGroup.mentions, [{ accountId: VERA, name: "Vera" }]);
  const direct = await sendAs(
    ctx,
    MAYA,
    "@Vera and @Me",
    [
      { accountId: VERA, name: "Vera" },
      { accountId: ME, name: "Me" },
    ],
    "direct:a",
  );
  assert.deepEqual(direct.mentions, [{ accountId: VERA, name: "Vera" }]);
});

void test("a mention is its own activity item", async (t) => {
  at(t, NOW - 2 * HOUR);
  const { ctx } = chats();
  await sendAs(ctx, LEO, "hello all", []);
  at(t, NOW - HOUR);
  const mention = await sendAs(ctx, MAYA, "@Me look", [
    { accountId: ME, name: "Me" },
  ]);
  at(t, NOW);
  const items = await activity(ctx, ME, { mentions: true });
  assert.deepEqual(
    items.map((item) => [
      item.key,
      item.kind === "messages" ? item.count : item.kind,
    ]),
    [
      [`mention:${mention.messageId}`, "mention"],
      ["messages:group:b", 1],
    ],
  );
  // Apps that don't ask for mentions count it with the rest.
  const older = await activity(ctx, ME);
  assert.deepEqual(
    older.map((item) => (item.kind === "messages" ? item.count : item.kind)),
    [2],
  );
});

void test("at mentions, only mentions show", async (t) => {
  at(t, NOW - HOUR);
  const { ctx } = chats();
  await setAlerts(ctx, ME, { alerts: "mentions", conversationId: "group:b" });
  await sendAs(ctx, LEO, "hello all", []);
  await sendAs(ctx, MAYA, "@Me look", [{ accountId: ME, name: "Me" }]);
  at(t, NOW);
  const items = await activity(ctx, ME, { mentions: true });
  assert.deepEqual(
    items.map(({ kind }) => kind),
    ["mention"],
  );
  const older = await activity(ctx, ME);
  assert.deepEqual(
    older.map((item) => (item.kind === "messages" ? item.count : item.kind)),
    [1],
  );

  await setAlerts(ctx, ME, { alerts: "none", conversationId: "group:b" });
  assert.deepEqual(await activity(ctx, ME, { mentions: true }), []);
});

void test("reading a conversation sees its mentions", async (t) => {
  at(t, NOW - HOUR);
  const { ctx } = chats();
  await sendAs(ctx, MAYA, "@Me look", [{ accountId: ME, name: "Me" }]);
  at(t, NOW);
  await seeConversationActivity(ctx, ME, "group:b", NOW);
  const items = await activity(ctx, ME, { mentions: true });
  assert.equal(items.length, 1);
  assert.equal(items.filter(isUnseen).length, 0);
});
