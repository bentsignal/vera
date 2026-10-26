import type { OperationArgs } from "@decentralized-convex/plugin";

import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { messagesProtocol } from "./protocol.ts";
import { memberAddresses, requireAccess } from "./model.ts";
import { TYPING_TIMEOUT } from "./protocol.ts";

// Who is typing. Like messages, each account's typing is stored on its
// home PDS, and apps gather it from every member's.

type Operations = (typeof messagesProtocol)["mutations"] &
  (typeof messagesProtocol)["queries"];
type Args<Operation extends keyof Operations> = OperationArgs<
  Operations[Operation]
>;

/**
 * A `setTyping` this soon after the last one changes nothing, so an app
 * that says so on every keystroke doesn't wake every reader each time.
 */
const MIN_REFRESH_MS = 1_000;
/** Timed-out rows of other accounts deleted per `setTyping`. */
const MAX_PRUNED = 10;
/** At most this many typists are listed per PDS. */
const MAX_TYPISTS = 50;

function typingRow(ctx: QueryCtx, accountId: string, conversationId: string) {
  return ctx.db
    .query("typing")
    .withIndex("by_account_conversation", (index) =>
      index.eq("accountId", accountId).eq("conversationId", conversationId),
    )
    .unique();
}

/** Starts or keeps up (`typing: true`) or ends the caller's typing. */
export async function setTyping(
  ctx: MutationCtx,
  self: string,
  args: Args<"setTyping">,
) {
  const { conversationId, threadId, typing } = args;
  await requireAccess(ctx, conversationId, self);
  const now = Date.now();
  const existing = await typingRow(ctx, self, conversationId);
  if (!typing) {
    if (existing !== null) await ctx.db.delete(existing._id);
    return null;
  }
  const current =
    existing !== null &&
    existing.threadId === threadId &&
    existing.typedAt > now - TYPING_TIMEOUT;
  if (current && existing.typedAt > now - MIN_REFRESH_MS) return null;
  if (existing === null) {
    await ctx.db.insert("typing", {
      accountId: self,
      conversationId,
      startedAt: now,
      threadId,
      typedAt: now,
    });
  } else {
    await ctx.db.patch(existing._id, {
      startedAt: current ? existing.startedAt : now,
      threadId,
      typedAt: now,
    });
  }
  await pruneTimedOut(ctx, conversationId, now);
  return null;
}

/** Deletes rows left by apps that stopped without saying so. */
async function pruneTimedOut(
  ctx: MutationCtx,
  conversationId: string,
  now: number,
) {
  const stale = await ctx.db
    .query("typing")
    .withIndex("by_conversation", (index) =>
      index
        .eq("conversationId", conversationId)
        .lt("typedAt", now - TYPING_TIMEOUT),
    )
    .take(MAX_PRUNED);
  for (const row of stale) await ctx.db.delete(row._id);
}

/** Sending a message ends its author's typing in that conversation. */
export async function stopTyping(
  ctx: MutationCtx,
  self: string,
  conversationId: string,
) {
  const existing = await typingRow(ctx, self, conversationId);
  if (existing !== null) await ctx.db.delete(existing._id);
}

/**
 * This PDS's accounts typing in a conversation, or with `threadId`, in
 * that thread, other than the caller, plus the member addresses so the
 * client asks every member's PDS too.
 */
export async function typing(
  ctx: QueryCtx,
  self: string,
  args: Args<"typing">,
) {
  const { conversation } = await requireAccess(ctx, args.conversationId, self);
  const now = Date.now();
  // Only this conversation's or thread's typing, so typing elsewhere in
  // the conversation doesn't rerun it.
  const rows = await ctx.db
    .query("typing")
    .withIndex("by_conversation_thread_typed", (index) =>
      index
        .eq("conversationId", args.conversationId)
        .eq("threadId", args.threadId)
        .gt("typedAt", now - TYPING_TIMEOUT),
    )
    .take(MAX_TYPISTS + 1);
  const typists = rows
    .filter((row) => row.accountId !== self)
    .slice(0, MAX_TYPISTS)
    .map(({ accountId, startedAt, typedAt }) => ({
      accountId,
      expiresIn: typedAt + TYPING_TIMEOUT - now,
      startedAt,
      typedAt,
    }));
  return { routes: await memberAddresses(ctx, conversation), typists };
}
