import type { Infer } from "convex/values";
import { v } from "convex/values";

import type { QueryCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import { fail, isAssistant, requireAccess, toMessage } from "./model.ts";
import { olderThan } from "./paging.ts";
import { alreadySent, storeMessage } from "./sending.ts";
import { messageById, replyTo } from "./threads.ts";
import { writeTyping } from "./typing.ts";
import { validateMessage } from "./validation.ts";

// Assistants: accounts the host answers people with (such as Vera's),
// which anyone can call into a conversation they're in by @mentioning
// one, without it being a member. The host registers them
// (`setAssistant`) and does the rest through these functions, which only
// the host can call (Component functions are never reachable by clients):
// reading what the caller can see around the message that called it
// (`summonContext`), and answering that message (`reply`, `setTyping`).
// Nothing here reads anywhere the caller can't, or writes anywhere but
// in answer to the caller's own message.

/** Where an assistant's reply goes, relative to the message that called it. */
export const replyPlace = v.union(
  // In the thread of the message that called it, kept there.
  v.literal("thread"),
  // In the conversation, quoting it (and joining its thread).
  v.literal("reply"),
  // In the conversation, as a plain message after such a reply.
  v.literal("conversation"),
);

export type ReplyPlace = Infer<typeof replyPlace>;

/** Makes an account an assistant, or stops it being one. */
export const setAssistant = mutation({
  args: { accountId: v.string(), assistant: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { accountId, assistant }) => {
    const row = await ctx.db
      .query("assistants")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .unique();
    if (assistant && row === null) {
      await ctx.db.insert("assistants", { accountId });
    }
    if (!assistant && row !== null) await ctx.db.delete(row._id);
    return null;
  },
});

/**
 * The message that called an assistant: the caller's own, in a
 * conversation they can see. Fails otherwise.
 */
async function summoningMessage(
  ctx: QueryCtx,
  {
    assistantId,
    callerId,
    conversationId,
    messageId,
  }: {
    assistantId: string;
    callerId: string;
    conversationId: string;
    messageId: string;
  },
) {
  if (!(await isAssistant(ctx, assistantId))) fail("NOT_AN_ASSISTANT");
  const access = await requireAccess(ctx, conversationId, callerId);
  const message = await messageById(ctx, messageId);
  if (
    message?.conversationId !== conversationId ||
    message.authorId !== callerId ||
    message.deletedAt !== undefined
  ) {
    fail("MESSAGE_NOT_FOUND");
  }
  return { access, message };
}

/**
 * What an assistant reads to answer the caller's message `messageId`,
 * seen as the caller sees it: the message, the conversation's kind and
 * member count, and a page of what came before it (with `before`, older
 * than that), oldest first. A reply kept in its thread is read with that
 * thread: its replies, and the original (`root`). Any other message is
 * read with the conversation, and with the original it replies to.
 */
export const summonContext = query({
  args: {
    assistantId: v.string(),
    before: v.optional(v.number()),
    callerId: v.string(),
    conversationId: v.string(),
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    const { access, message } = await summoningMessage(ctx, args);
    const { conversation } = access;
    const scope =
      message.threadOnly === true && message.threadId !== undefined
        ? { threadId: message.threadId }
        : { conversationId: args.conversationId };
    const page = await olderThan(ctx, scope, args.before ?? message.sentAt + 1);
    const root =
      message.threadId === undefined
        ? null
        : await messageById(ctx, message.threadId);
    return {
      conversation: {
        kind: conversation.kind,
        name: conversation.name ?? null,
      },
      hasOlder: page.hasMore,
      inThread: "threadId" in scope,
      message: toMessage(message),
      messages: page.messages
        .filter(
          (shown) =>
            shown.conversationId === args.conversationId &&
            shown.deletedAt === undefined,
        )
        .map(toMessage),
      root:
        root?.conversationId === args.conversationId ? toMessage(root) : null,
    };
  },
});

/**
 * Sends an assistant's answer to the caller's message `inReplyTo`, where
 * `place` says. The host checks the caller asked; this checks the
 * message is theirs and in the conversation.
 */
export const reply = mutation({
  args: {
    assistantId: v.string(),
    assistantName: v.string(),
    body: v.string(),
    callerId: v.string(),
    conversationId: v.string(),
    inReplyTo: v.string(),
    messageId: v.string(),
    place: replyPlace,
  },
  handler: async (ctx, args) => {
    const { assistantId, conversationId } = args;
    await summoningMessage(ctx, { ...args, messageId: args.inReplyTo });
    const body = args.body.trim();
    validateMessage(body, []);
    const retried = await alreadySent(ctx, assistantId, args.messageId);
    if (retried !== null) return retried;
    const reply =
      args.place === "conversation"
        ? undefined
        : await replyTo(
            ctx,
            conversationId,
            args.inReplyTo,
            args.place === "thread",
          );
    return storeMessage(
      ctx,
      {
        attachments: [],
        authorId: assistantId,
        authorName: args.assistantName,
        body,
        conversationId,
        mentions: undefined,
        messageId: args.messageId,
        reply,
      },
      { joinsThread: false },
    );
  },
});

/** Shows an assistant typing its answer to `inReplyTo` where it'll go, or stops. */
export const setTyping = mutation({
  args: {
    assistantId: v.string(),
    callerId: v.string(),
    conversationId: v.string(),
    inReplyTo: v.string(),
    place: replyPlace,
    typing: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { message } = await summoningMessage(ctx, {
      ...args,
      messageId: args.inReplyTo,
    });
    return writeTyping(ctx, args.assistantId, {
      conversationId: args.conversationId,
      // A thread is named by its original (threads are flat).
      threadId:
        args.place === "thread"
          ? (message.threadId ?? message.messageId)
          : undefined,
      typing: args.typing,
    });
  },
});
