import type { ModelMessage, StepResult, ToolSet } from "ai";
import { isStepCount } from "ai";
import { v } from "convex/values";

import type { ActionCtx, MutationCtx } from "./_generated/server";
import type { Turn } from "./agentTools";
import type { BotAccount } from "./bots";
import type { Tally } from "./usage";
import { modelOrder } from "../assistant-models";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import {
  teamNote,
  toAnswer,
  toModelMessages,
  visibleImageTypes,
} from "./agentHistory";
import { generateReply } from "./agentModels";
import { currentTools, keepTyping, messageSender } from "./agentTools";
import { waitWhileTyping } from "./assistantHook";
import { botAccount, botAddress, sendAsBot } from "./bots";
import { recallOlder } from "./memory";
import { takeReply } from "./rateLimits";
import { usageOf } from "./usage";
import { veraAssistant } from "./vera";

// The harness every assistant runs on. A direct message to one schedules
// `run` (bots.ts `afterPdsMutation`); it reads the conversation, hands it to
// the model with the assistant's instructions and tools, and the model
// answers by calling `send_message`. One reply runs per conversation at a
// time; messages that arrive meanwhile get the next one.

export interface Assistant {
  readonly instructions: (turn: Turn) => Promise<string>;
  readonly tools: (turn: Turn) => ToolSet;
}

const ASSISTANTS: Record<BotAccount["username"], Assistant> = {
  vera: veraAssistant,
};

/** How long one model call may take before it's tried again (it's usually 2-5 s). */
const STEP_TIMEOUT = 40_000;
/** Model calls in one reply (each may call several tools). */
const MAX_STEPS = 8;
/** A reply that has run this long is assumed to have died. */
const STALE_RUN = 10 * 60 * 1000;

/** How hard the model thinks before each step: lower is faster and cheaper. */
const REASONING = { convexGateway: { reasoningEffort: "low" } };

const FAILURE_NOTICE =
  "Sorry, something went wrong on my end. Try again in a moment.";

export const run = internalAction({
  args: { conversationId: v.string(), wakeAt: v.number() },
  handler: async (ctx, { conversationId, wakeAt }) => {
    const claim = await ctx.runMutation(internal.agent.claim, {
      conversationId,
      wakeAt,
    });
    if (claim === null) return;
    const bot = botAccount(claim.bot);
    let answeredThrough: number | undefined;
    try {
      answeredThrough = await reply(ctx, bot, conversationId, claim);
    } catch (error) {
      console.error(`${bot.username} failed to reply`, error);
      await ctx.runMutation(internal.bots.post, {
        body: FAILURE_NOTICE,
        bot: bot.username,
        conversationId,
      });
    } finally {
      await ctx.runMutation(internal.agent.finish, {
        answeredThrough,
        conversationId,
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
  args: { conversationId: v.string(), wakeAt: v.number() },
  handler: async (ctx, { conversationId, wakeAt }) => {
    const row = await dueRow(ctx, conversationId, wakeAt);
    if (row === null) return null;
    const now = Date.now();
    if (row.runningSince !== undefined && now - row.runningSince < STALE_RUN) {
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
        await sendAsBot(ctx, botAccount(row.bot), conversationId, limit.notice);
      }
      return null;
    }
    // The team's note is this reply's alone: taken here, so one added
    // while it runs waits for the next.
    await ctx.db.patch(row._id, {
      note: undefined,
      rerun: false,
      runningSince: now,
      waitingSince: undefined,
    });
    return {
      accountId: row.accountId,
      answeredThrough: row.answeredThrough ?? null,
      bot: row.bot,
      note: row.note ?? null,
    };
  },
});

/** The conversation's reply state, if this wake-up is the one it's waiting for. */
async function dueRow(
  ctx: MutationCtx,
  conversationId: string,
  wakeAt: number,
) {
  const row = await ctx.db
    .query("botConversations")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .unique();
  if (row?.wakeAt !== wakeAt) return null;
  // Vera Support's rows wait for the merge (mergeSupport.ts) to remove them.
  if (row.bot === "support") return null;
  return { ...row, bot: row.bot };
}

/** Ends a reply, and starts the next if messages came in meanwhile. */
export const finish = internalMutation({
  args: {
    answeredThrough: v.optional(v.number()),
    conversationId: v.string(),
  },
  handler: async (ctx, { answeredThrough, conversationId }) => {
    const row = await ctx.db
      .query("botConversations")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .unique();
    if (row === null) return;
    const answered = {
      answeredThrough: Math.max(row.answeredThrough ?? 0, answeredThrough ?? 0),
    };
    // Vera remembers the whole conversation (memory.ts).
    if (row.bot === "vera") {
      await ctx.scheduler.runAfter(0, internal.memoryBuild.update, {
        bot: row.bot,
        conversationId,
      });
    }
    if (row.rerun !== true) {
      await ctx.db.patch(row._id, {
        ...answered,
        runningSince: undefined,
      });
      return;
    }
    const wakeAt = Date.now();
    await ctx.db.patch(row._id, {
      ...answered,
      rerun: false,
      runningSince: undefined,
      wakeAt,
    });
    await ctx.scheduler.runAfter(0, internal.agent.run, {
      conversationId,
      wakeAt,
    });
  },
});

/**
 * Ends the reply after a step that only sent messages (or shared the bug-report
 * privacy notice): the model has said its piece and waits for them. It goes
 * on only after other tools, such as a search, whose results it needs.
 * Without this, models keep talking after their answer, even to themselves.
 */
function saidItsPiece({ steps }: { steps: StepResult<ToolSet>[] }) {
  const calls = steps.at(-1)?.toolCalls ?? [];
  return (
    calls.some(
      (call) =>
        call.toolName === "share_privacy_notice" ||
        call.toolName === "stay_quiet",
    ) ||
    (calls.length > 0 &&
      calls.every((call) => call.toolName === "send_message"))
  );
}

/**
 * Answers the person's messages that no reply has seen yet, and returns
 * when the newest of them was sent (undefined when there were none).
 */
async function reply(
  ctx: ActionCtx,
  bot: BotAccount,
  conversationId: string,
  {
    accountId,
    answeredThrough,
    note,
  }: {
    accountId: string;
    answeredThrough: number | null;
    note: string | null;
  },
) {
  const page = await ctx.runQuery(internal.bots.page, {
    bot: bot.username,
    conversationId,
  });
  const self = botAddress(bot);
  // A note from the team is reason enough to write, even with nothing new.
  const history = toAnswer(page.messages, self, answeredThrough, note !== null);
  const newest = history?.findLast((message) => message.authorId !== self);
  if (history === null || newest === undefined) return;
  await ctx.runMutation(internal.bots.markRead, {
    bot: bot.username,
    conversationId,
  });
  const typing = keepTyping(ctx, bot, conversationId);
  try {
    const sender = messageSender(ctx, bot, conversationId, typing);
    const tally: Tally = { memoryLookups: 0, searches: 0 };
    const started = Date.now();
    const turn: Turn = {
      ...sender,
      counted: (what) => {
        if (what === "search") tally.searches += 1;
        else tally.memoryLookups += 1;
      },
      accountId,
      bot,
      conversationId,
      ctx,
      note,
      lastHeardAt: newest.sentAt,
      name: newest.authorName,
      oldestSentAt: page.hasOlder ? (history[0]?.sentAt ?? null) : null,
      recalled: await recallOlder(ctx, bot, conversationId, {
        answeredThrough,
        hasOlder: page.hasOlder,
        history,
        tally,
      }),
      timeZone: await ctx.runQuery(internal.timeZones.of, { accountId }),
    };
    const assistant = ASSISTANTS[bot.username];
    const tools = assistant.tools(turn);
    // Last before it answers, where it outweighs what the chat says.
    const closing: ModelMessage[] = [
      ...(note === null
        ? []
        : [{ content: teamNote(note), role: "system" as const }]),
      { content: currentTools(tools), role: "system" as const },
    ];
    const models = modelOrder(visibleImageTypes(history, self)).map(
      (model) => ({
        messages: [...toModelMessages(history, self, model), ...closing],
        model,
      }),
    );
    const options = {
      allowSystemInMessages: true,
      instructions: await assistant.instructions(turn),
      providerOptions: REASONING,
      stopWhen: [isStepCount(MAX_STEPS), saidItsPiece],
      // Every step calls a tool: it speaks only through send_message (or
      // stays quiet), and models otherwise often answer in plain text.
      toolChoice: "required" as const,
      timeout: { stepMs: STEP_TIMEOUT },
      toolCallConcurrency: 1,
      tools,
    };
    const results = await generateReply(options, models, sender, bot);
    await ctx.runMutation(internal.usage.record, {
      ...usageOf(results, tally),
      accountId,
      bot: bot.username,
      ms: Date.now() - started,
    });
  } finally {
    await typing.stop();
  }
  return newest.sentAt;
}
