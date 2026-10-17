import type { OperationArgs } from "@decentralized-convex/plugin";

import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { LinkCard, messagesProtocol, Quote } from "./protocol.ts";
import { previewedUrls } from "./links.ts";
import { recordMentions, validMentions } from "./mentions.ts";
import { fail, requireAccess, toMessage } from "./model.ts";
import { MAX_REPLIERS } from "./protocol.ts";
import {
  messageById,
  QUOTE_LENGTH,
  threadMembers,
  threadRow,
} from "./threads.ts";
import { validateMessage } from "./validation.ts";

// Changing and deleting your own messages. Messages live on their author's
// home PDS, so only the author's PDS can change one, and it does so for
// everyone. Replies stored here that quote a changed message follow it.

/**
 * Starts a message's link cards (see `startLinkCards` in sending), passed
 * in so this module loads without Convex's generated API, as in tests.
 */
export type StartLinkCards = (
  ctx: MutationCtx,
  messageId: string,
  body: string,
  now: number,
) => Promise<LinkCard[] | undefined>;

type Mutations = (typeof messagesProtocol)["mutations"];
type Args<Operation extends keyof Mutations> = OperationArgs<
  Mutations[Operation]
>;

/**
 * The caller's own message in the conversation, still there. A deleted
 * thread original kept for its replies counts as gone.
 */
async function ownMessage(
  ctx: QueryCtx,
  self: string,
  { conversationId, messageId }: { conversationId: string; messageId: string },
) {
  const message = await messageById(ctx, messageId);
  if (
    message?.conversationId !== conversationId ||
    message.deletedAt !== undefined
  ) {
    fail("MESSAGE_NOT_FOUND");
  }
  if (message.authorId !== self) fail("NOT_MESSAGE_AUTHOR");
  return message;
}

/**
 * Whether a reply's quote is of `message`. Quotes from before they named
 * their message match by author and text instead.
 */
function quotes(quote: Quote, message: Doc<"messages">) {
  if (quote.messageId !== undefined)
    return quote.messageId === message.messageId;
  return (
    quote.authorId === message.authorId &&
    quote.body === message.body.slice(0, QUOTE_LENGTH)
  );
}

/**
 * Rewrites the quotes of `message` in the replies stored here, which are
 * in its thread (its own, or as a reply, its original's) and sent after it.
 */
async function rewriteQuotes(
  ctx: MutationCtx,
  message: Doc<"messages">,
  change: (quote: Quote) => Quote,
) {
  const replies = ctx.db
    .query("messages")
    .withIndex("by_thread_sent", (index) =>
      index
        .eq("threadId", message.threadId ?? message.messageId)
        .gt("sentAt", message.sentAt),
    );
  for await (const reply of replies) {
    if (reply.quote === undefined || !quotes(reply.quote, message)) continue;
    await ctx.db.patch(reply._id, {
      quote: { ...change(reply.quote), messageId: message.messageId },
    });
  }
}

/** Forgets the accounts a message mentioned, for their activity. */
async function forgetMentions(ctx: MutationCtx, message: Doc<"messages">) {
  const mentioned = new Set(
    (message.mentions ?? []).map(({ accountId }) => accountId),
  );
  for (const accountId of mentioned) {
    const rows = await ctx.db
      .query("mentions")
      .withIndex("by_account_conversation_sent", (index) =>
        index
          .eq("accountId", accountId)
          .eq("conversationId", message.conversationId)
          .eq("sentAt", message.sentAt),
      )
      .collect();
    for (const row of rows) {
      if (row.messageId === message.messageId) await ctx.db.delete(row._id);
    }
  }
}

/**
 * The link cards for edited text: the ones it had while its links are the
 * same, or new ones, filled in from the cache or fetched, when they change.
 */
async function linkCardsFor(
  ctx: MutationCtx,
  message: Doc<"messages">,
  body: string,
  { now, startLinkCards }: { now: number; startLinkCards: StartLinkCards },
) {
  const before = previewedUrls(message.body);
  const after = previewedUrls(body);
  if (
    message.linkPreviews !== undefined &&
    before.length === after.length &&
    before.every((link, index) => link === after[index])
  ) {
    return message.linkPreviews;
  }
  return startLinkCards(ctx, message.messageId, body, now);
}

/**
 * Changes the text of the caller's message (its attachments stay), and
 * who it mentions. Anyone it newly mentions finds it in their activity,
 * without a push. Replies here that quote it quote the new text.
 */
export async function editMessage(
  ctx: MutationCtx,
  self: string,
  args: Args<"editMessage">,
  startLinkCards: StartLinkCards,
) {
  const access = await requireAccess(ctx, args.conversationId, self);
  const message = await ownMessage(ctx, self, args);
  const body = args.body.trim();
  validateMessage(body, message.attachments);
  const mentions = await validMentions(ctx, access, self, body, args.mentions);
  if (
    body === message.body &&
    JSON.stringify(mentions) === JSON.stringify(message.mentions)
  ) {
    return toMessage(message);
  }
  const now = Date.now();
  const linkPreviews = await linkCardsFor(ctx, message, body, {
    now,
    startLinkCards,
  });
  const edited = {
    ...message,
    body,
    editedAt: now,
    linkPreview: linkPreviews?.[0]?.preview ?? undefined,
    linkPreviews,
    mentions,
  };
  // Undefined fields are removed (no mentions, no links).
  await ctx.db.patch(message._id, {
    body,
    editedAt: now,
    linkPreview: edited.linkPreview,
    linkPreviews,
    mentions,
  });
  await forgetMentions(ctx, message);
  await recordMentions(ctx, edited);
  await rewriteQuotes(ctx, message, (quote) => ({
    ...quote,
    body: body.slice(0, QUOTE_LENGTH),
  }));
  return toMessage(edited);
}

/**
 * Forgets a thread whose last reply was deleted, with its original when
 * that was deleted too.
 */
async function forgetThread(ctx: MutationCtx, thread: Doc<"threads">) {
  for (const member of await threadMembers(ctx, thread.threadId)) {
    await ctx.db.delete(member._id);
  }
  await ctx.db.delete(thread._id);
  const original = await messageById(ctx, thread.threadId);
  if (original?.deletedAt !== undefined) await ctx.db.delete(original._id);
}

/**
 * The newest of a thread's replies besides `reply`, and who wrote them,
 * newest first, at most `MAX_REPLIERS`.
 */
async function otherReplies(ctx: QueryCtx, reply: Doc<"messages">) {
  const replies = ctx.db
    .query("messages")
    .withIndex("by_thread_sent", (index) =>
      index.eq("threadId", reply.threadId),
    )
    .order("desc");
  let lastReplyAt: number | undefined;
  const repliers = new Array<string>();
  for await (const other of replies) {
    if (other.messageId === reply.messageId) continue;
    lastReplyAt ??= other.sentAt;
    if (!repliers.includes(other.authorId)) repliers.push(other.authorId);
    if (repliers.length >= MAX_REPLIERS) break;
  }
  return { lastReplyAt, repliers };
}

/**
 * Takes a deleted reply out of its thread's count. A thread left without
 * replies is forgotten (see `forgetThread`).
 */
async function removeReply(ctx: MutationCtx, reply: Doc<"messages">) {
  if (reply.threadId === undefined) return;
  const thread = await threadRow(ctx, reply.threadId);
  if (thread === null) return;
  if (thread.replyCount <= 1) {
    await forgetThread(ctx, thread);
    return;
  }
  const { lastReplyAt, repliers } = await otherReplies(ctx, reply);
  await ctx.db.patch(thread._id, {
    lastReplyAt: lastReplyAt ?? thread.lastReplyAt,
    replyCount: thread.replyCount - 1,
    repliers,
  });
}

/** Deletes the reactions stored here to a deleted message. */
async function deleteReactions(ctx: MutationCtx, message: Doc<"messages">) {
  const reactions = await ctx.db
    .query("reactions")
    .withIndex("by_message", (index) =>
      index.eq("messageId", message.messageId),
    )
    .collect();
  for (const reaction of reactions) {
    if (reaction.conversationId === message.conversationId) {
      await ctx.db.delete(reaction._id);
    }
  }
}

/** Stops filling in a deleted message's link cards. */
async function deleteLinkWaits(ctx: MutationCtx, messageId: string) {
  const waits = await ctx.db
    .query("linkPreviewWaits")
    .withIndex("by_message", (index) => index.eq("messageId", messageId))
    .collect();
  for (const wait of waits) await ctx.db.delete(wait._id);
}

/**
 * Deletes the caller's message for everyone, with its reactions and
 * mentions stored here. A thread's original with replies stays, emptied
 * and marked `deletedAt`, so its thread can still be opened; any other
 * message is gone. Replies here that quote it show it was deleted.
 * Deleting it again, or a message that isn't there, does nothing.
 */
export async function deleteMessage(
  ctx: MutationCtx,
  self: string,
  args: Args<"deleteMessage">,
) {
  await requireAccess(ctx, args.conversationId, self);
  const found = await messageById(ctx, args.messageId);
  // Already deleted: a retry.
  if (found === null) return null;
  if (found.deletedAt !== undefined && found.authorId === self) return null;
  const message = await ownMessage(ctx, self, args);
  await forgetMentions(ctx, message);
  await deleteReactions(ctx, message);
  await deleteLinkWaits(ctx, message.messageId);
  await rewriteQuotes(ctx, message, ({ authorId }) => ({
    authorId,
    body: "",
    deleted: true,
  }));
  await removeReply(ctx, message);
  // Only an original has a thread of its own.
  const thread =
    message.threadId === undefined
      ? await threadRow(ctx, message.messageId)
      : null;
  if (thread !== null && thread.replyCount > 0) {
    // Undefined fields are removed.
    await ctx.db.patch(message._id, {
      attachments: [],
      body: "",
      deletedAt: Date.now(),
      editedAt: undefined,
      linkPreview: undefined,
      linkPreviews: undefined,
      mentions: undefined,
    });
  } else {
    await ctx.db.delete(message._id);
  }
  return null;
}
