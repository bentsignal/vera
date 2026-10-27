import type { Message } from "@decentralized-convex/messages";
import { v } from "convex/values";

import type { MutationCtx } from "./_generated/server";
import type { BotAccount } from "./bots";
import type { SummonPlace } from "./summonPrompt";
import { components, internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { mentionsAssistant as mentionsWritten } from "../assistant-mentions";
import { botAccount, botAddress, isBotAddress } from "./bots";
import { takeReply } from "./rateLimits";
import { botName } from "./schema";
import { answer } from "./summonReply";

// Calling Vera into any other conversation: a message that @mentions it,
// in a group, a channel, or a direct message with someone else, gets one
// answer, in a thread on that message unless it asks for one in the chat.
// Nothing else there reaches Vera, not even replies in that thread, until
// someone mentions it again. It isn't a member: the messages plugin lets
// the host read what the caller can see around their message and answer
// it (`assistants` in @decentralized-convex/messages).
//
// Everyone there reads the answer, so it knows nothing private about
// anyone: no notes, no memory of anyone's chats with Vera, no one's bug
// reports. Its tools act for the caller alone, and take no account or
// conversation, so nothing said there can point them at someone else.

const FAILURE_NOTICE =
  "Sorry, something went wrong on my end. Try again in a moment.";

/** Whether a message @mentions an assistant (assistant-mentions.ts). */
export function mentionsAssistant(
  bot: BotAccount,
  body: string,
  mentions: unknown,
) {
  return mentionsWritten(
    { address: botAddress(bot), username: bot.username },
    body,
    mentions,
  );
}

/**
 * The router's `afterMutation` (assistantHook.ts) saw a message that
 * mentions an assistant outside its own direct messages: it's answered
 * once, right away. A send retried with the same ID isn't answered again.
 */
export async function startSummon(
  ctx: MutationCtx,
  {
    accountId,
    bot,
    conversationId,
    messageId,
  }: {
    accountId: string;
    bot: BotAccount;
    conversationId: string;
    messageId: string;
  },
) {
  if (isBotAddress(accountId)) return;
  const existing = await ctx.db
    .query("botSummons")
    .withIndex("by_message", (q) => q.eq("messageId", messageId))
    .unique();
  if (existing !== null) return;
  // Assistants become one on setup (bots.ts); this covers one set up
  // before there were summons.
  await ctx.runMutation(components.messages.assistants.setAssistant, {
    accountId: botAddress(bot),
    assistant: true,
  });
  await ctx.db.insert("botSummons", {
    accountId,
    bot: bot.username,
    conversationId,
    messageId,
  });
  await ctx.scheduler.runAfter(0, internal.summons.run, { messageId });
}

export const run = internalAction({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }) => {
    const claim = await ctx.runMutation(internal.summons.claim, { messageId });
    if (claim === null) return;
    const bot = botAccount(claim.bot);
    const summon = { ...claim, bot, messageId };
    const posted = { count: 0 };
    try {
      await answer(ctx, summon, posted);
    } catch (error) {
      console.error(`${bot.username} failed to answer a mention`, error);
      // Once something went out, the answer is there, if short.
      if (posted.count === 0) {
        await ctx
          .runMutation(internal.summons.post, {
            ...summonArgs(summon),
            body: FAILURE_NOTICE,
            place: "thread",
          })
          .catch((cause: unknown) => {
            // Their message is gone, say.
            console.warn("Couldn't say the mention failed", cause);
          });
      }
    } finally {
      await ctx.runMutation(internal.summons.finish, { messageId });
    }
  },
});

/**
 * Starts answering the message, or returns null: it's already answered, or
 * its author is over their hourly limit (rateLimits.ts), shared with their
 * direct messages to the assistant.
 */
export const claim = internalMutation({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }) => {
    const row = await ctx.db
      .query("botSummons")
      .withIndex("by_message", (q) => q.eq("messageId", messageId))
      .unique();
    if (row === null || row.startedAt !== undefined) return null;
    await ctx.db.patch(row._id, { startedAt: Date.now() });
    const limit = await takeReply(ctx, {
      accountId: row.accountId,
      bot: row.bot,
    });
    if (!limit.ok) {
      if (limit.notice !== null) {
        await replyAs(ctx, {
          ...row,
          body: limit.notice,
          place: "thread",
        });
      }
      return null;
    }
    return {
      accountId: row.accountId,
      bot: row.bot,
      conversationId: row.conversationId,
    };
  },
});

export const finish = internalMutation({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }) => {
    const row = await ctx.db
      .query("botSummons")
      .withIndex("by_message", (q) => q.eq("messageId", messageId))
      .unique();
    if (row !== null) await ctx.db.patch(row._id, { finishedAt: Date.now() });
  },
});

export interface Summon {
  /** Who called it. */
  readonly accountId: string;
  readonly bot: BotAccount;
  readonly conversationId: string;
  /** Their message that called it. */
  readonly messageId: string;
}

export function summonArgs(summon: Summon) {
  return {
    accountId: summon.accountId,
    bot: summon.bot.username,
    conversationId: summon.conversationId,
    messageId: summon.messageId,
  };
}

const summonFields = {
  accountId: v.string(),
  bot: botName,
  conversationId: v.string(),
  messageId: v.string(),
};

const place = v.union(v.literal("thread"), v.literal("inline"));

/**
 * Posts the assistant's answer to the caller's message: in its thread, or
 * in the conversation, quoting it the first time (`inline`, `first`).
 */
function replyAs(
  ctx: MutationCtx,
  {
    accountId,
    body,
    bot,
    conversationId,
    first = true,
    messageId,
    place,
  }: {
    accountId: string;
    body: string;
    bot: BotAccount["username"];
    conversationId: string;
    first?: boolean;
    messageId: string;
    place: SummonPlace;
  },
) {
  const account = botAccount(bot);
  return ctx.runMutation(components.messages.assistants.reply, {
    assistantId: botAddress(account),
    assistantName: account.name,
    body,
    callerId: accountId,
    conversationId,
    inReplyTo: messageId,
    messageId: crypto.randomUUID(),
    place: place === "thread" ? "thread" : first ? "reply" : "conversation",
  });
}

export const post = internalMutation({
  args: {
    ...summonFields,
    body: v.string(),
    first: v.optional(v.boolean()),
    place,
  },
  handler: async (ctx, args) => {
    await replyAs(ctx, args);
    return null;
  },
});

export const setTyping = internalMutation({
  args: { ...summonFields, place, typing: v.boolean() },
  handler: (ctx, { accountId, bot, conversationId, messageId, ...args }) =>
    ctx.runMutation(components.messages.assistants.setTyping, {
      assistantId: botAddress(botAccount(bot)),
      callerId: accountId,
      conversationId,
      inReplyTo: messageId,
      place: args.place === "thread" ? "thread" : "reply",
      typing: args.typing,
    }),
});

/**
 * What the caller can see around their message (the messages plugin's
 * `summonContext`): the conversation, or the thread it's in, up to it.
 */
export const context = internalQuery({
  args: { ...summonFields, before: v.optional(v.number()) },
  handler: (
    ctx,
    { accountId, before, bot, conversationId, messageId },
  ): Promise<SummonContextValue> =>
    ctx.runQuery(components.messages.assistants.summonContext, {
      assistantId: botAddress(botAccount(bot)),
      before,
      callerId: accountId,
      conversationId,
      messageId,
    }),
});

/** What `context` returns. */
export interface SummonContextValue {
  readonly conversation: { kind: string; name: string | null };
  readonly hasOlder: boolean;
  readonly inThread: boolean;
  readonly message: Message;
  readonly messages: Message[];
  readonly root: Message | null;
}
