import assert from "node:assert/strict";
import test from "node:test";

import { fakeCtx } from "./fakeCtx.ts";
import { TYPING_TIMEOUT } from "./protocol.ts";
import { setTyping, stopTyping, typing } from "./typing.ts";

const MAYA = "maya@vera.chat";
const LEO = "leo@vera.chat";
const PRIYA = "priya@vera.chat";
const GROUP = "group:vera.chat:1";

function group() {
  return fakeCtx({
    conversations: [
      { conversationId: GROUP, createdBy: MAYA, kind: "group", updatedAt: 0 },
    ],
    members: [MAYA, LEO, PRIYA].map((accountId) => ({
      accountId,
      conversationId: GROUP,
      lastReadAt: 0,
      muted: false,
      role: accountId === MAYA ? "owner" : "member",
    })),
  });
}

async function typistsFor(
  fake: ReturnType<typeof group>,
  self: string,
  threadId?: string,
) {
  const found = await typing(fake.ctx, self, {
    conversationId: GROUP,
    threadId,
  });
  return found.typists;
}

void test("others see who's typing, with how long it lasts", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 10_000 });
  const fake = group();
  await setTyping(fake.ctx, MAYA, { conversationId: GROUP, typing: true });
  t.mock.timers.tick(1_000);
  const seen = await typistsFor(fake, LEO);
  assert.deepEqual(seen, [
    {
      accountId: MAYA,
      expiresIn: TYPING_TIMEOUT - 1_000,
      startedAt: 10_000,
      typedAt: 10_000,
    },
  ]);
  // Nobody sees their own typing.
  assert.deepEqual(await typistsFor(fake, MAYA), []);
  const routed = await typing(fake.ctx, LEO, { conversationId: GROUP });
  assert.deepEqual([...routed.routes].sort(), [LEO, MAYA, PRIYA]);
});

void test("typing times out, and stopping ends it at once", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 10_000 });
  const fake = group();
  await setTyping(fake.ctx, MAYA, { conversationId: GROUP, typing: true });
  t.mock.timers.tick(TYPING_TIMEOUT);
  assert.deepEqual(await typistsFor(fake, LEO), []);
  await setTyping(fake.ctx, MAYA, { conversationId: GROUP, typing: true });
  await setTyping(fake.ctx, MAYA, { conversationId: GROUP, typing: false });
  assert.deepEqual(await typistsFor(fake, LEO), []);
  assert.equal(fake.rows("typing").length, 0);
});

void test("keeping it up keeps when it started", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 10_000 });
  const fake = group();
  await setTyping(fake.ctx, MAYA, { conversationId: GROUP, typing: true });
  // Too soon to write again.
  t.mock.timers.tick(500);
  await setTyping(fake.ctx, MAYA, { conversationId: GROUP, typing: true });
  assert.equal(fake.rows("typing")[0]?.typedAt, 10_000);
  t.mock.timers.tick(2_500);
  await setTyping(fake.ctx, MAYA, { conversationId: GROUP, typing: true });
  const [typist] = await typistsFor(fake, LEO);
  assert.ok(typist);
  assert.equal(typist.startedAt, 10_000);
  assert.equal(typist.typedAt, 13_000);
  assert.equal(typist.expiresIn, TYPING_TIMEOUT);
  // After timing out, typing again is a new bout.
  t.mock.timers.tick(TYPING_TIMEOUT);
  await setTyping(fake.ctx, MAYA, { conversationId: GROUP, typing: true });
  const [again] = await typistsFor(fake, LEO);
  assert.ok(again);
  assert.equal(again.startedAt, 19_000);
  assert.equal(fake.rows("typing").length, 1);
});

// `send` calls this in the same write that stores the message.
void test("sending a message ends its author's typing", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 10_000 });
  const fake = group();
  await setTyping(fake.ctx, MAYA, { conversationId: GROUP, typing: true });
  await setTyping(fake.ctx, PRIYA, { conversationId: GROUP, typing: true });
  await stopTyping(fake.ctx, MAYA, GROUP);
  const typists = await typistsFor(fake, LEO);
  assert.deepEqual(
    typists.map(({ accountId }) => accountId),
    [PRIYA],
  );
});

void test("typing in a thread shows only in that thread", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 10_000 });
  const fake = group();
  await setTyping(fake.ctx, MAYA, {
    conversationId: GROUP,
    threadId: "m1",
    typing: true,
  });
  assert.deepEqual(await typistsFor(fake, LEO), []);
  assert.equal((await typistsFor(fake, LEO, "m1")).length, 1);
  assert.deepEqual(await typistsFor(fake, LEO, "m2"), []);
});

void test("only members can type or see typing", async () => {
  const fake = group();
  const outsider = "outsider@vera.chat";
  await assert.rejects(
    setTyping(fake.ctx, outsider, { conversationId: GROUP, typing: true }),
  );
  await assert.rejects(typing(fake.ctx, outsider, { conversationId: GROUP }));
});

void test("rows left behind are cleaned up", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 10_000 });
  const fake = group();
  await setTyping(fake.ctx, MAYA, { conversationId: GROUP, typing: true });
  t.mock.timers.tick(TYPING_TIMEOUT + 1);
  await setTyping(fake.ctx, LEO, { conversationId: GROUP, typing: true });
  assert.deepEqual(
    fake.rows("typing").map(({ accountId }) => accountId),
    [LEO],
  );
});
