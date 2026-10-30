import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { Answered } from "./agentReply";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { reply } from "./agentReply";
import { replyRow, scheduleRun, waitWhileTyping } from "./assistantHook";
import { botAccount, sendAsBot } from "./bots";
import { takeReply } from "./rateLimits";

// The harness every assistant runs on. A direct message to one schedules
// `run` (assistantHook.ts); it claims the conversation, replies
// (agentReply.ts), and finishes, starting the next reply if messages came
// in meanwhile. One reply runs per conversation at a time (each thread in
// it is a conversation of its own, with `threadId`), and `watch` checks on
// it in case its action dies without finishing.

/**
 * A reply that has run this long is assumed to have died, when there's no
 * scheduled job to ask (rows from before `running`).
 */
const STALE_RUN = 10 * 60 * 1000;
/** How often a running reply is checked on, in case it died. */
const WATCH_EVERY = 15_000;

const FAILURE_NOTICE =
  "Sorry, something went wrong on my end. Try again in a moment.";

const chat = {
  conversationId: v.string(),
  /** A thread in the conversation, which is answered as one of its own. */
  threadId: v.optional(v.string()),
};

export const run = internalAction({
  args: { ...chat, wakeAt: v.number() },
  handler: async (ctx, { conversationId, threadId, wakeAt }) => {
    const claim = await ctx.runMutation(internal.agent.claim, {
      conversationId,
      threadId,
      wakeAt,
    });
    if (claim === null) return;
    const bot = botAccount(claim.bot);
    let answered: Answered | undefined;
    try {
      answered = await reply(ctx, bot, { conversationId, threadId }, claim);
    } catch (error) {
      console.error(`${bot.username} failed to reply`, error);
      await ctx.runMutation(internal.bots.post, {
        body: FAILURE_NOTICE,
        bot: bot.username,
        conversationId,
        threadId,
      });
    } finally {
      await ctx.runMutation(internal.agent.finish, {
        ...answered,
        conversationId,
        threadId,
      });
    }
  },
});

/**
 * Starts the reply this wake-up is for, or returns null: a newer message
 * moved it later, one is already running (it answers next), or the person
 * is over the hourly limit (rateLimits.ts).
 */
export const claim = internalMutation({
  args: { ...chat, wakeAt: v.number() },
  handler: async (ctx, { conversationId, threadId, wakeAt }) => {
    const row = await dueRow(ctx, conversationId, threadId, wakeAt);
    if (row === null) return null;
    const now = Date.now();
    // A reply that died is taken over: this one answers its messages too.
    if ((await runState(ctx, row, now)) === "running") {
      await ctx.db.patch(row._id, { rerun: true });
      return null;
    }
    if (await waitWhileTyping(ctx, row, now)) return null;
    const limit = await takeReply(ctx, {
      accountId: row.accountId,
      bot: row.bot,
    });
    if (!limit.ok) {
      if (limit.notice !== null) {
        await sendAsBot(ctx, botAccount(row.bot), conversationId, limit.notice, {
          threadId,
        });
      }
      return null;
    }
    // The team's note is this reply's alone: taken here, so one added
    // while it runs waits for the next.
    await ctx.db.patch(row._id, {
      note: undefined,
      rerun: false,
      running: row.runId,
      runningSince: now,
      waitingSince: undefined,
    });
    await ctx.scheduler.runAfter(WATCH_EVERY, internal.agent.watch, {
      conversationId,
      runningSince: now,
      threadId,
    });
    return {
      accountId: row.accountId,
      answeredThrough: row.answeredThrough ?? null,
      bot: row.bot,
      historyFrom: row.historyFrom ?? null,
      note: row.note ?? null,
    };
  },
});

/** The conversation's reply state, if this wake-up is the one it's waiting for. */
async function dueRow(
  ctx: MutationCtx,
  conversationId: string,
  threadId: string | undefined,
  wakeAt: number,
) {
  const row = await replyRow(ctx, conversationId, threadId);
  if (row?.wakeAt !== wakeAt) return null;
  // Vera Support's rows wait for the merge (mergeSupport.ts) to remove them.
  if (row.bot === "support") return null;
  return { ...row, bot: row.bot };
}

/** Ends a reply, and starts the next if messages came in meanwhile. */
export const finish = internalMutation({
  args: {
    ...chat,
    answeredThrough: v.optional(v.number()),
    historyFrom: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { answeredThrough, conversationId, historyFrom, threadId },
  ) => {
    const row = await replyRow(ctx, conversationId, threadId);
    if (row === null) return;
    const answered = {
      answeredThrough: Math.max(row.answeredThrough ?? 0, answeredThrough ?? 0),
      ...(historyFrom !== undefined && { historyFrom }),
    };
    // Vera remembers the whole conversation (memory.ts), apart from its
    // threads, which it reads whole.
    if (row.bot === "vera" && threadId === undefined) {
      await ctx.scheduler.runAfter(0, internal.memoryBuild.update, {
        bot: row.bot,
        conversationId,
      });
    }
    await endRun(ctx, row, answered);
  },
});

/**
 * Checks on a running reply. One whose job died without finishing (it ran
 * out of memory, say, which skips `run`'s `finally`) would otherwise hold
 * the conversation until `STALE_RUN`, ignoring every message meanwhile.
 * This ends it: the next reply answers what came in since, or, with
 * nothing new, the person hears that something went wrong.
 */
export const watch = internalMutation({
  args: { ...chat, runningSince: v.number() },
  handler: async (ctx, { conversationId, runningSince, threadId }) => {
    const row = await replyRow(ctx, conversationId, threadId);
    if (row?.runningSince !== runningSince) return;
    const state = await runState(ctx, row, Date.now());
    if (state === "running") {
      await ctx.scheduler.runAfter(WATCH_EVERY, internal.agent.watch, {
        conversationId,
        runningSince,
        threadId,
      });
      return;
    }
    console.error(`${row.bot}'s reply in ${conversationId} died`);
    // Vera Support's rows wait for the merge (mergeSupport.ts); its account
    // can't write any more.
    if (row.rerun !== true && row.bot === "vera") {
      await sendAsBot(ctx, botAccount(row.bot), conversationId, FAILURE_NOTICE, {
        threadId,
      });
    }
    await endRun(ctx, row, {});
  },
});

/** Whether the row's reply is still running, or died without finishing. */
async function runState(
  ctx: MutationCtx,
  row: Doc<"botConversations">,
  now: number,
) {
  if (row.runningSince === undefined) return "idle";
  if (row.running === undefined) {
    return now - row.runningSince < STALE_RUN ? "running" : "died";
  }
  const job = await ctx.db.system.get("_scheduled_functions", row.running);
  const kind = job?.state.kind;
  return kind === "pending" || kind === "inProgress" ? "running" : "died";
}

/** Ends the running reply, and starts the next if messages came in meanwhile. */
async function endRun(
  ctx: MutationCtx,
  row: Doc<"botConversations">,
  answered: { answeredThrough?: number; historyFrom?: number },
) {
  const ended = { ...answered, running: undefined, runningSince: undefined };
  if (row.rerun !== true) {
    await ctx.db.patch(row._id, ended);
    return;
  }
  const wakeAt = Date.now();
  await ctx.db.patch(row._id, {
    ...ended,
    rerun: false,
    runId: await scheduleRun(ctx, row, wakeAt),
    wakeAt,
  });
}
