import type { OperationArgs } from "@decentralized-convex/plugin";

import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { messagesProtocol } from "./protocol.ts";
import { internal } from "./_generated/api.js";
import { MAX_LINK_PREVIEWS } from "./links.ts";
import { fail, memberAddresses, requireAccess } from "./model.ts";
import { MAX_ATTACHMENTS, MAX_REACTION_MESSAGES } from "./protocol.ts";

/** How long a new reaction waits before its push, in case it's undone. */
const REACTION_PUSH_DELAY_MS = 3000;

type Operations = (typeof messagesProtocol)["mutations"] &
  (typeof messagesProtocol)["queries"];
type Args<Operation extends keyof Operations> = OperationArgs<
  Operations[Operation]
>;

/** Different emoji one account may leave on a single message. */
const MAX_REACTIONS_PER_ACCOUNT = 20;
const MAX_EMOJI_LENGTH = 16;

function validEmoji(emoji: string) {
  return (
    emoji.length > 0 && emoji.length <= MAX_EMOJI_LENGTH && !/\s/.test(emoji)
  );
}

/** An index under `max`: an attachment's, or a link preview's. */
function validIndex(index: number | undefined, max: number) {
  return (
    index === undefined ||
    (Number.isInteger(index) && index >= 0 && index < max)
  );
}

/** A reaction names one part at most (see `reaction`). */
function requireValidReaction({ attachment, emoji, link }: Args<"react">) {
  if (
    !validEmoji(emoji) ||
    !validIndex(attachment, MAX_ATTACHMENTS) ||
    !validIndex(link, MAX_LINK_PREVIEWS) ||
    (attachment !== undefined && link !== undefined)
  ) {
    fail("INVALID_REACTION");
  }
}

/**
 * The message reacted to, when it's stored here: messages live on their
 * author's home PDS, and one stored here names its author, whose
 * activity lists the reaction. A deleted one takes no reactions.
 */
async function storedMessage(ctx: QueryCtx, messageId: string) {
  const message = await ctx.db
    .query("messages")
    .withIndex("by_message", (index) => index.eq("messageId", messageId))
    .unique();
  if (message?.deletedAt !== undefined) fail("MESSAGE_NOT_FOUND");
  return message;
}

export async function react(
  ctx: MutationCtx,
  self: string,
  selfName: string,
  args: Args<"react">,
) {
  await requireAccess(ctx, args.conversationId, self);
  requireValidReaction(args);
  const mine = await ctx.db
    .query("reactions")
    .withIndex("by_message_account", (index) =>
      index.eq("messageId", args.messageId).eq("accountId", self),
    )
    .collect();
  const existing = mine.find(
    (row) =>
      row.emoji === args.emoji &&
      row.attachment === args.attachment &&
      row.link === args.link,
  );
  if (!args.on) {
    if (existing !== undefined) await ctx.db.delete(existing._id);
    return null;
  }
  if (existing !== undefined) return null;
  if (mine.length >= MAX_REACTIONS_PER_ACCOUNT) fail("TOO_MANY_REACTIONS");
  const message = await storedMessage(ctx, args.messageId);
  await ctx.db.insert("reactions", {
    accountId: self,
    attachment: args.attachment,
    conversationId: args.conversationId,
    emoji: args.emoji,
    link: args.link,
    messageId: args.messageId,
    messageAuthorId:
      message?.conversationId === args.conversationId
        ? message.authorId
        : undefined,
    reactedAt: Date.now(),
  });
  if (message !== null && message.authorId !== self) {
    await ctx.scheduler.runAfter(
      REACTION_PUSH_DELAY_MS,
      internal.reactionPush.sendReaction,
      {
        emoji: args.emoji,
        messageId: args.messageId,
        reactorId: self,
        reactorName: selfName,
      },
    );
  }
  return null;
}

/**
 * Reactions stored here to the given messages, plus the conversation's
 * member addresses so the client also asks every member's PDS.
 */
export async function reactions(
  ctx: QueryCtx,
  self: string,
  args: Args<"reactions">,
) {
  const { conversation } = await requireAccess(ctx, args.conversationId, self);
  if (args.messageIds.length > MAX_REACTION_MESSAGES) {
    fail("TOO_MANY_MESSAGES");
  }
  const found = [];
  for (const messageId of new Set(args.messageIds)) {
    const rows = await ctx.db
      .query("reactions")
      .withIndex("by_message", (index) => index.eq("messageId", messageId))
      .collect();
    found.push(
      ...rows
        .filter((row) => row.conversationId === args.conversationId)
        .map(({ accountId, attachment, emoji, link, reactedAt }) => ({
          accountId,
          attachment,
          emoji,
          link,
          messageId,
          reactedAt,
        })),
    );
  }
  return { reactions: found, routes: await memberAddresses(ctx, conversation) };
}
