import type { ToolSet } from "ai";

import type { ActionCtx } from "./_generated/server";
import type { Turn } from "./agentTools";
import type { BotAccount } from "./bots";
import type { Tally } from "./usage";
import { MAX_HISTORY } from "../assistant-history";
import { internal } from "./_generated/api";
import { toAnswer } from "./agentHistory";
import { generateReply } from "./agentModels";
import { cachedPartHash, replyRequest } from "./agentRequest";
import { keepTyping, messageSender } from "./agentTools";
import { botAddress } from "./bots";
import { recallOlder } from "./memory";
import { supportAssistant } from "./supportAgent";
import { usageOf } from "./usage";
import { veraAssistant } from "./vera";

// One reply of an assistant's (agent.ts `run`): it reads the conversation,
// hands it to the model with the assistant's instructions and tools
// (`Prompt`, agentRequest.ts), and the model answers by calling
// `send_message`.

export interface Assistant {
  /** Sets up one reply: what the model is told, and its tools. */
  readonly prepare: (turn: Turn) => Promise<Prompt>;
}

/**
 * What the model gets for a reply, laid out for the provider's prompt
 * cache, which reuses the unchanged start of a request at a quarter of the
 * price: the tools, then `instructions`, then the conversation, then
 * `latest` (agent.ts `reply`). Anything that changes in that start makes
 * the rest of the request full price, conversation and all.
 */
export interface Prompt {
  /**
   * Its rules, then what it knows about this person. This may change only
   * when something happens (they file a report, save a note), never just
   * because it's a new reply: the time, what they just said, and what's
   * looked up for it go in `latest`.
   */
  readonly instructions: string;
  /**
   * What changes from reply to reply (memories recalled for what they just
   * said), read after the conversation, with the time and the team's note.
   */
  readonly latest?: string;
  /** Its tools. Their names and descriptions must not change either. */
  readonly tools: ToolSet;
}

const ASSISTANTS: Record<BotAccount["username"], Assistant> = {
  support: supportAssistant,
  vera: veraAssistant,
};

/** What a reply answered, for `finish`. */
export interface Answered {
  /** When the newest message it answered was sent. */
  answeredThrough: number;
  /** The first message it saw (assistant-history.ts). */
  historyFrom?: number;
}

/**
 * The conversation's newest messages, oldest first, reaching back to
 * `from` (the window's start, assistant-history.ts) unless that's more
 * than the window holds, and whether there are older ones.
 */
async function recentMessages(
  ctx: ActionCtx,
  bot: BotAccount,
  conversationId: string,
  from: number | null,
) {
  let page = await ctx.runQuery(internal.bots.page, {
    bot: bot.username,
    conversationId,
  });
  let messages = page.messages;
  while (
    page.hasOlder &&
    from !== null &&
    (messages.at(0)?.sentAt ?? 0) > from &&
    messages.length <= MAX_HISTORY
  ) {
    page = await ctx.runQuery(internal.bots.page, {
      before: messages.at(0)?.sentAt,
      bot: bot.username,
      conversationId,
    });
    messages = [...page.messages, ...messages];
  }
  return { hasOlder: page.hasOlder, messages };
}

/** What `claim` hands a reply (agent.ts). */
interface Claimed {
  readonly accountId: string;
  readonly answeredThrough: number | null;
  readonly historyFrom: number | null;
  readonly note: string | null;
}

/**
 * The messages the model sees, if the person wrote since the last reply
 * (or the team left a note): with the newest of theirs, the window's start
 * (assistant-history.ts), and the oldest one when there are older ones
 * still, which it can read or recall. Null when there's nothing to answer.
 */
async function conversationToAnswer(
  ctx: ActionCtx,
  bot: BotAccount,
  conversationId: string,
  {
    answeredThrough,
    historyFrom,
    note,
    self,
  }: Omit<Claimed, "accountId"> & { readonly self: string },
) {
  const recent = await recentMessages(ctx, bot, conversationId, historyFrom);
  const answering = toAnswer(recent.messages, self, {
    answeredThrough,
    // A note from the team is reason enough to write, even with nothing new.
    evenIfAnswered: note !== null,
    from: historyFrom,
  });
  if (answering === null) return null;
  const { from, history } = answering;
  const newest = history.findLast((message) => message.authorId !== self);
  const first = history.at(0);
  if (newest === undefined || first === undefined) return null;
  const hasOlder =
    recent.hasOlder || recent.messages.at(0)?.sentAt !== first.sentAt;
  return {
    from,
    history,
    newest,
    oldestSentAt: hasOlder ? first.sentAt : null,
  };
}

/**
 * Answers the person's messages that no reply has seen yet. Returns
 * undefined when there were none.
 */
export async function reply(
  ctx: ActionCtx,
  bot: BotAccount,
  conversationId: string,
  claimed: Claimed,
): Promise<Answered | undefined> {
  const self = botAddress(bot);
  const answering = await conversationToAnswer(ctx, bot, conversationId, {
    ...claimed,
    self,
  });
  if (answering === null) return;
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
      accountId: claimed.accountId,
      bot,
      conversationId,
      ctx,
      note: claimed.note,
      lastHeardAt: answering.newest.sentAt,
      name: answering.newest.authorName,
      oldestSentAt: answering.oldestSentAt,
      recalled: await recallOlder(ctx, bot, conversationId, {
        answeredThrough: claimed.answeredThrough,
        hasOlder: answering.oldestSentAt !== null,
        history: answering.history,
        tally,
      }),
      self,
      timeZone: await ctx.runQuery(internal.timeZones.of, {
        accountId: claimed.accountId,
      }),
    };
    const prompt = await ASSISTANTS[bot.username].prepare(turn);
    const { models, options } = await replyRequest(
      ctx,
      turn,
      answering.history,
      prompt,
    );
    const results = await generateReply(options, models, sender, bot);
    await ctx.runMutation(internal.usage.record, {
      ...usageOf(results, tally),
      accountId: claimed.accountId,
      bot: bot.username,
      cachedPart: await cachedPartHash(prompt.instructions, prompt.tools),
      conversationId,
      ms: Date.now() - started,
    });
  } finally {
    await typing.stop();
  }
  return {
    answeredThrough: answering.newest.sentAt,
    ...(answering.from !== null && { historyFrom: answering.from }),
  };
}
