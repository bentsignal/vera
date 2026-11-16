import type { Message } from "@decentralized-convex/messages";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { experimental_decide as decide } from "ai";
import { v } from "convex/values";

import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { BotAccount } from "./bots";
import type { SummonContextValue } from "./summons";
import { GATE_MODEL, gateChoice, gateRequest } from "../thread-gate";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { botAccount, botAddress, isBotAddress } from "./bots";
import { requireEnvironment } from "./lib";
import { mentionsAssistant, startSummon } from "./summons";

// The threads an assistant follows: one that starts with a message that
// @mentions it, and one where someone mentions it in a reply (summons.ts).
// Every reply there reaches it from then on, not only mentions. A reply waits a moment for more, and while anyone's typing
// there, so a quick back-and-forth gets one look once it pauses. Then the
// gate (thread-gate.ts), a cheap decision model, reads the thread and
// picks the new reply meant for the assistant, if any. Only that one is
// answered, by the main model as if it had mentioned it, and it may still
// stay quiet. Nothing shows the assistant typing until the gate says yes.

type DecisionModel = Parameters<typeof decide>[0]["model"];

/**
 * The provider's `evaluationModel`, typed: its published types leave it
 * untyped (`var evaluationModel;`), though it makes a decision model.
 */
function isDecisionModelFactory(
  value: unknown,
): value is (modelId: string, options: { zdr: boolean }) => DecisionModel {
  return typeof value === "function";
}

function gateModel() {
  const factory: unknown = Reflect.get(convexGateway, "evaluationModel");
  if (!isDecisionModelFactory(factory)) {
    throw new Error("The AI Gateway provider has no decision models");
  }
  return factory(GATE_MODEL, { zdr: true });
}

/** How long a reply waits for more, so a burst gets one look. */
const LISTEN_DELAY = 2500;
/** How often a look checks whether they've stopped typing, and for how long. */
const TYPING_RECHECK = 2500;
const MAX_TYPING_WAIT = 30_000;

function summonOf(ctx: QueryCtx, messageId: string) {
  return ctx.db
    .query("botSummons")
    .withIndex("by_message", (q) => q.eq("messageId", messageId))
    .unique();
}

function threadRow(ctx: QueryCtx, threadId: string) {
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

/**
 * The thread to look at now, or null: a newer reply moved the look later,
 * or someone's typing there, which moves it a few seconds later (for up
 * to 30 seconds, in case typing never clears).
 */
export const wake = internalMutation({
  args: { threadId: v.string(), wakeAt: v.number() },
  handler: async (ctx, { threadId, wakeAt }) => {
    const row = await threadRow(ctx, threadId);
    if (row?.wakeAt !== wakeAt) return null;
    const now = Date.now();
    const typists = await ctx
      .runQuery(components.messages.assistants.threadTyping, {
        assistantId: botAddress(botAccount(row.bot)),
        callerId: row.accountId,
        conversationId: row.conversationId,
        messageId: row.messageId,
      })
      .catch(() => []);
    const waited = row.waitingSince === undefined ? 0 : now - row.waitingSince;
    if (typists.length > 0 && waited < MAX_TYPING_WAIT) {
      const later = now + TYPING_RECHECK;
      await ctx.db.patch(row._id, {
        waitingSince: row.waitingSince ?? now,
        wakeAt: later,
      });
      await ctx.scheduler.runAt(later, internal.summonThreads.look, {
        threadId,
        wakeAt: later,
      });
      return null;
    }
    await ctx.db.patch(row._id, { waitingSince: undefined, wakeAt: undefined });
    return {
      accountId: row.accountId,
      bot: row.bot,
      checkedThrough: row.checkedThrough ?? 0,
      conversationId: row.conversationId,
      messageId: row.messageId,
    };
  },
});

export const look = internalAction({
  args: { threadId: v.string(), wakeAt: v.number() },
  handler: async (ctx, { threadId, wakeAt }) => {
    const row = await ctx.runMutation(internal.summonThreads.wake, {
      threadId,
      wakeAt,
    });
    if (row === null) return;
    const bot = botAccount(row.bot);
    let found: SummonContextValue;
    try {
      found = await ctx.runQuery(internal.summons.context, {
        accountId: row.accountId,
        bot: row.bot,
        conversationId: row.conversationId,
        messageId: row.messageId,
      });
    } catch {
      // The reply was deleted, say.
      return;
    }
    // Only the thread: a reply also sent to the chat is read with the
    // conversation (the plugin's `summonContext`).
    const thread = [
      ...(found.root === null ? [] : [found.root]),
      ...found.messages.filter((message) => message.threadId === threadId),
    ];
    const fresh = freshReplies(bot, thread, row.checkedThrough);
    const through = Math.max(
      row.checkedThrough,
      ...thread.map((m) => m.sentAt),
    );
    const judged = await judge(bot, thread, fresh);
    await ctx.runMutation(internal.summonThreads.checked, {
      ...judged,
      threadId,
      through,
    });
  },
});

/**
 * Asks the gate which of the `fresh` replies, if any, is meant for the
 * assistant. Nothing is chosen when there are none, or the gate fails.
 */
async function judge(
  bot: BotAccount,
  thread: readonly Message[],
  fresh: readonly Message[],
) {
  if (fresh.length === 0) return { cost: 0, judged: false };
  const self = botAddress(bot);
  const freshIds = fresh.map((message) => message.messageId);
  const { labels, request } = gateRequest(
    bot.name,
    thread.map((message) => ({
      from: message.authorId === self ? bot.name : message.authorName,
      messageId: message.messageId,
      sentAt: message.sentAt,
      text: textOf(message),
    })),
    freshIds,
    Date.now(),
  );
  const started = Date.now();
  try {
    const decision = await decide({
      maxRetries: 1,
      model: gateModel(),
      ...request,
    });
    const answer = decision.answers.forAssistant;
    const chosen = gateChoice(answer.choice, labels, freshIds);
    console.log(
      `${bot.username} gate: ${chosen === null ? "none" : "answer"} (${answer.choice}, ${JSON.stringify(answer.probabilities)}) in ${Date.now() - started} ms`,
    );
    const author = fresh.find(
      (message) => message.messageId === chosen?.messageId,
    )?.authorId;
    return {
      chosen:
        chosen === null || author === undefined
          ? undefined
          : { accountId: author, messageId: chosen.messageId },
      cost: costOf(decision.providerMetadata),
      judged: true,
    };
  } catch (error) {
    console.warn(`${bot.username} gate failed`, error);
    return { cost: 0, judged: false };
  }
}

/**
 * The replies the gate hasn't judged: after the assistant's last message
 * and the last mention of it (both answered with what came before), and
 * after what it already read. Only people on this PDS, whose messages
 * the assistant can answer.
 */
function freshReplies(
  bot: BotAccount,
  thread: readonly Message[],
  checkedThrough: number,
) {
  const self = botAddress(bot);
  const answered = thread
    .filter(
      (message) =>
        message.authorId === self ||
        mentionsAssistant(bot, message.body, message.mentions),
    )
    .map((message) => message.sentAt);
  const since = Math.max(checkedThrough, ...answered);
  const domain = `@${requireEnvironment("FEDERATION_DOMAIN").toLowerCase()}`;
  return thread.filter(
    (message) =>
      message.sentAt > since &&
      message.authorId.toLowerCase().endsWith(domain) &&
      !isBotAddress(message.authorId),
  );
}

/** A message's text for the gate, with what it attached. */
function textOf(message: Message) {
  const attached =
    message.attachments.length === 0
      ? ""
      : ` (${message.attachments.map((attachment) => attachment.kind).join(", ")})`;
  return `${message.body}${attached}`.trim();
}

function costOf(metadata: unknown) {
  const gateway: unknown = Reflect.get(Object(metadata), "convexGateway");
  const cost: unknown = Reflect.get(Object(gateway), "cost");
  return typeof cost === "number" ? cost : 0;
}

/** Records what the gate read, and answers the reply it chose. */
export const checked = internalMutation({
  args: {
    chosen: v.optional(
      v.object({ accountId: v.string(), messageId: v.string() }),
    ),
    cost: v.number(),
    /** Whether the gate ran (none to judge, or it failed, otherwise). */
    judged: v.boolean(),
    threadId: v.string(),
    through: v.number(),
  },
  handler: async (ctx, { chosen, cost, judged, threadId, through }) => {
    const row = await threadRow(ctx, threadId);
    if (row === null) return;
    await ctx.db.patch(row._id, {
      checkedThrough: Math.max(row.checkedThrough ?? 0, through),
      gateChecks: row.gateChecks + (judged ? 1 : 0),
      gateCost: row.gateCost + cost,
    });
    if (chosen === undefined) return;
    await startSummon(ctx, {
      accountId: chosen.accountId,
      bot: botAccount(row.bot),
      conversationId: row.conversationId,
      heard: true,
      messageId: chosen.messageId,
    });
  },
});
