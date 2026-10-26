import assert from "node:assert/strict";
import test from "node:test";

import { latestMessage } from "./chatMessages.ts";
import { deleteMessage, editMessage as edit } from "./editing.ts";
import { olderThan } from "./paging.ts";
import { GROUP, LEO, MAYA, ME, setup } from "./threads.testing.ts";
import { thread, threadSummaries } from "./threads.ts";

// Editing and deleting your own messages.

type EditArgs = Parameters<typeof edit>[2];

/** Edits without links, which would start fetches. */
function editMessage(
  ctx: Parameters<typeof edit>[0],
  self: string,
  args: EditArgs,
) {
  return edit(ctx, self, args, () => Promise.resolve(undefined));
}

function rejects(promise: Promise<unknown>, code: string) {
  return assert.rejects(promise, (error: { data?: { code?: string } }) => {
    assert.equal(error.data?.code, code);
    return true;
  });
}

void test("an edit changes the text, marks it edited, and follows into quotes", async (t) => {
  const { ctx, rows, say } = setup(t);
  await say(ME, "root");
  await say(MAYA, "reply", "root");
  t.mock.timers.tick(60_000);
  const edited = await editMessage(ctx, ME, {
    body: " Fixed it ",
    conversationId: GROUP,
    messageId: "root",
  });
  assert.equal(edited.body, "Fixed it");
  assert.equal(edited.editedAt, Date.now());
  const reply = rows("messages").find(({ messageId }) => messageId === "reply");
  assert.deepEqual(reply?.quote, {
    attachment: undefined,
    authorId: ME,
    body: "Fixed it",
    messageId: "root",
  });
});

void test("an edit that changes nothing leaves the message alone", async (t) => {
  const { ctx, say } = setup(t);
  await say(ME, "root");
  const same = await editMessage(ctx, ME, {
    body: "root from me@vera.chat",
    conversationId: GROUP,
    messageId: "root",
  });
  assert.equal(same.editedAt, undefined);
});

void test("an edit moves who it mentions", async (t) => {
  const { ctx, rows, say } = setup(t);
  await say(ME, "hi", undefined, {
    mentions: [{ accountId: MAYA, name: "Maya" }],
  });
  await editMessage(ctx, ME, {
    body: "hi @Leo",
    conversationId: GROUP,
    mentions: [{ accountId: LEO, name: "Leo" }],
    messageId: "hi",
  });
  assert.deepEqual(
    rows("mentions").map(({ accountId }) => accountId),
    [LEO],
  );
});

void test("only the author can edit or delete a message", async (t) => {
  const { ctx, say } = setup(t);
  await say(MAYA, "theirs");
  await rejects(
    editMessage(ctx, ME, {
      body: "mine now",
      conversationId: GROUP,
      messageId: "theirs",
    }),
    "NOT_MESSAGE_AUTHOR",
  );
  await rejects(
    deleteMessage(ctx, ME, { conversationId: GROUP, messageId: "theirs" }),
    "NOT_MESSAGE_AUTHOR",
  );
  await rejects(
    editMessage(ctx, ME, { body: "", conversationId: GROUP, messageId: "x" }),
    "MESSAGE_NOT_FOUND",
  );
});

void test("text can't be edited away from a message with nothing else", async (t) => {
  const { ctx, say } = setup(t);
  await say(ME, "root");
  await rejects(
    editMessage(ctx, ME, {
      body: " ",
      conversationId: GROUP,
      messageId: "root",
    }),
    "EMPTY_MESSAGE",
  );
});

void test("a deleted message is gone, with its reactions and mentions", async (t) => {
  const { ctx, rows, say } = setup(t);
  await say(MAYA, "first");
  await say(ME, "oops", undefined, {
    mentions: [{ accountId: MAYA, name: "Maya" }],
  });
  await ctx.db.insert("reactions", {
    accountId: MAYA,
    conversationId: GROUP,
    emoji: "👍",
    messageId: "oops",
    reactedAt: Date.now(),
  });
  await deleteMessage(ctx, ME, { conversationId: GROUP, messageId: "oops" });
  const shown = await olderThan(ctx, { conversationId: GROUP }, undefined);
  assert.deepEqual(
    shown.messages.map(({ messageId }) => messageId),
    ["first"],
  );
  assert.equal(rows("reactions").length, 0);
  assert.equal(rows("mentions").length, 0);
  assert.equal((await latestMessage(ctx, GROUP)).shown?.messageId, "first");
  // Deleting it again does nothing.
  await deleteMessage(ctx, ME, { conversationId: GROUP, messageId: "oops" });
});

void test("a deleted original with replies stays, emptied, for its thread", async (t) => {
  const { ctx, rows, say } = setup(t);
  await say(ME, "root");
  await say(MAYA, "reply", "root");
  await deleteMessage(ctx, ME, { conversationId: GROUP, messageId: "root" });
  const page = await thread(ctx, LEO, {
    conversationId: GROUP,
    threadId: "root",
  });
  assert.equal(page.page.root?.body, "");
  assert.equal(typeof page.page.root.deletedAt, "number");
  const reply = rows("messages").find(({ messageId }) => messageId === "reply");
  assert.deepEqual(reply?.quote, {
    authorId: ME,
    body: "",
    deleted: true,
    messageId: "root",
  });
  // The inbox shows the reply, not the emptied original.
  assert.equal((await latestMessage(ctx, GROUP)).shown?.messageId, "reply");
  await rejects(
    editMessage(ctx, ME, {
      body: "back",
      conversationId: GROUP,
      messageId: "root",
    }),
    "MESSAGE_NOT_FOUND",
  );
});

void test("deleting a reply takes it out of its thread's count", async (t) => {
  const { ctx, rows, say } = setup(t);
  await say(ME, "root");
  await say(MAYA, "first", "root");
  await say(LEO, "second", "root");
  await deleteMessage(ctx, LEO, { conversationId: GROUP, messageId: "second" });
  const { summaries } = await threadSummaries(ctx, ME, {
    conversationId: GROUP,
    messageIds: ["root"],
  });
  assert.equal(summaries[0]?.replyCount, 1);
  assert.deepEqual(summaries[0].repliers, [MAYA]);

  await deleteMessage(ctx, MAYA, { conversationId: GROUP, messageId: "first" });
  assert.equal(rows("threads").length, 0);
  assert.equal(rows("threadMembers").length, 0);
});

void test("an emptied original goes once its last reply is deleted", async (t) => {
  const { ctx, say } = setup(t);
  await say(ME, "root");
  await say(MAYA, "reply", "root");
  await deleteMessage(ctx, ME, { conversationId: GROUP, messageId: "root" });
  await deleteMessage(ctx, MAYA, { conversationId: GROUP, messageId: "reply" });
  const shown = await olderThan(ctx, { conversationId: GROUP }, undefined);
  assert.equal(shown.messages.length, 0);
});

void test("a reply to a reply shows its quote deleted when that reply goes", async (t) => {
  const { ctx, rows, say } = setup(t);
  await say(ME, "root");
  await say(MAYA, "first", "root");
  await say(LEO, "nested", "first");
  await deleteMessage(ctx, MAYA, { conversationId: GROUP, messageId: "first" });
  const nested = rows("messages").find(
    ({ messageId }) => messageId === "nested",
  );
  assert.deepEqual(nested?.quote, {
    authorId: MAYA,
    body: "",
    deleted: true,
    messageId: "first",
  });
});
