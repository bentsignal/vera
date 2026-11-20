import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { BotAccount } from "./botAccounts";
import { internal } from "./_generated/api";
import { isBotAddress } from "./botAccounts";

// Following the threads an assistant is in (summonThreads.ts), as the PDS
// router's `afterMutation` (assistantHook.ts) sees their replies: each is
// recorded and a look scheduled. The look, and the gate model it asks,
// stay in summonThreads.ts, which nothing on the router's path imports
// (docs/architecture.md, "Function bundles").

/** How long a reply waits for more, so a burst gets one look. */
const LISTEN_DELAY = 2500;

function summonOf(ctx: QueryCtx, messageId: string) {
  return ctx.db
    .query("botSummons")
    .withIndex("by_message", (q) => q.eq("messageId", messageId))
    .unique();
}

export function threadRow(ctx: QueryCtx, threadId: string) {
  return ctx.db
    .query("botThreads")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .unique();
}

/** The assistant following a thread, if one is. */
async function followerOf(ctx: QueryCtx, threadId: string) {
  const row = await threadRow(ctx, threadId);
  if (row !== null) return row.bot;
  // Its original mentioned one, and no reply has been read yet.
  return (await summonOf(ctx, threadId))?.bot ?? null;
}

interface ThreadReply {
  accountId: string;
  conversationId: string;
  messageId: string;
  threadId: string;
}

/** Records the newest reply in a thread the assistant follows. */
async function follow(
  ctx: MutationCtx,
  bot: BotAccount["username"],
  { accountId, conversationId, messageId, threadId }: ThreadReply,
  wakeAt: number | undefined,
) {
  const update = { accountId, messageId, waitingSince: undefined, wakeAt };
  const row = await threadRow(ctx, threadId);
  if (row !== null) return ctx.db.patch(row._id, update);
  const counts = { gateChecks: 0, gateCost: 0 };
  await ctx.db.insert("botThreads", {
    ...update,
    ...counts,
    bot,
    conversationId,
    threadId,
  });
}

/**
 * A reply in a thread that didn't mention an assistant (assistantHook.ts):
 * in a thread one follows, the gate reads it after a pause.
 */
export async function heardInThread(ctx: MutationCtx, reply: ThreadReply) {
  if (isBotAddress(reply.accountId)) return;
  const bot = await followerOf(ctx, reply.threadId);
  if (bot === null) return;
  const wakeAt = Date.now() + LISTEN_DELAY;
  await follow(ctx, bot, reply, wakeAt);
  await ctx.scheduler.runAt(wakeAt, internal.summonThreads.look, {
    threadId: reply.threadId,
    wakeAt,
  });
}

/**
 * A mention in a thread: the assistant follows the thread from then on.
 * The mention is answered as one (summons.ts), reading the replies before
 * it, so a look waiting for those doesn't run.
 */
export async function mentionedInThread(
  ctx: MutationCtx,
  bot: BotAccount,
  reply: ThreadReply,
) {
  if (isBotAddress(reply.accountId)) return;
  await follow(ctx, bot.username, reply, undefined);
}
