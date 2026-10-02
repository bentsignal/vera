import type { OperationArgs } from "@decentralized-convex/plugin";

import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { messagesProtocol } from "./protocol.ts";
import { fail, memberAddresses, requireAccess } from "./model.ts";
import { MAX_REACTION_MESSAGES } from "./protocol.ts";

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

export async function react(
  ctx: MutationCtx,
  self: string,
  args: Args<"react">,
) {
  await requireAccess(ctx, args.conversationId, self);
  if (!validEmoji(args.emoji)) fail("INVALID_REACTION");
  const mine = await ctx.db
    .query("reactions")
    .withIndex("by_message_account", (index) =>
      index.eq("messageId", args.messageId).eq("accountId", self),
    )
    .collect();
  const existing = mine.find((row) => row.emoji === args.emoji);
  if (!args.on) {
    if (existing !== undefined) await ctx.db.delete(existing._id);
    return null;
  }
  if (existing !== undefined) return null;
  if (mine.length >= MAX_REACTIONS_PER_ACCOUNT) fail("TOO_MANY_REACTIONS");
  await ctx.db.insert("reactions", {
    accountId: self,
    conversationId: args.conversationId,
    emoji: args.emoji,
    messageId: args.messageId,
    reactedAt: Date.now(),
  });
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
        .map(({ accountId, emoji, reactedAt }) => ({
          accountId,
          emoji,
          messageId,
          reactedAt,
        })),
    );
  }
  return { reactions: found, routes: await memberAddresses(ctx, conversation) };
}
