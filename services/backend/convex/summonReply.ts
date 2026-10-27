import type { Message } from "@decentralized-convex/messages";

import type { ActionCtx } from "./_generated/server";
import type { Turn } from "./agentTools";
import type { SummonPlace } from "./summonPrompt";
import type { Summon, SummonContextValue } from "./summons";
import type { Tally } from "./usage";
import { internal } from "./_generated/api";
import { generateReply } from "./agentModels";
import { cachedPartHash, replyRequest } from "./agentRequest";
import { pacedSender, typingWith } from "./agentTools";
import { botAddress } from "./bots";
import { summonedPrompt } from "./summonPrompt";
import { summonArgs } from "./summons";
import { usageOf } from "./usage";

// One answer to a message that called Vera into a conversation
// (summons.ts `run`): it reads what the caller can see there, hands it to
// the model with summonPrompt.ts's instructions and tools, and posts what
// the model sends, in a thread on their message unless they asked for the
// chat.

/** The fewest recent messages it reads from the conversation, or a thread. */
const CONTEXT = 30;

/**
 * The messages the model reads: the newest `CONTEXT` before and including
 * theirs, after the thread's original when there is one; and the oldest of
 * those it read, where reading earlier picks up.
 */
function shownHistory(found: {
  messages: readonly Message[];
  root: Message | null;
}) {
  const recent = found.messages.slice(-CONTEXT);
  const oldestSentAt = recent.at(0)?.sentAt ?? null;
  const root = found.root;
  if (
    root === null ||
    recent.some((shown) => shown.messageId === root.messageId)
  ) {
    return { history: recent, oldestSentAt };
  }
  return { history: [root, ...recent], oldestSentAt };
}

/** Reads, asks the model, and posts the answer. */
export async function answer(
  ctx: ActionCtx,
  summon: Summon,
  posted: { count: number },
) {
  const found: SummonContextValue = await ctx.runQuery(
    internal.summons.context,
    summonArgs(summon),
  );
  const { history, oldestSentAt } = shownHistory(found);
  const self = botAddress(summon.bot);
  // Where it answers: a thread unless the model chooses the chat, which
  // it may only when they asked (summonPrompt.ts).
  let where: SummonPlace = "thread";
  let typingIn: SummonPlace = "thread";
  const typing = typingWith((on) =>
    ctx.runMutation(internal.summons.setTyping, {
      ...summonArgs(summon),
      place: typingIn,
      typing: on,
    }),
  );
  try {
    const sender = pacedSender(typing, async (body) => {
      await ctx.runMutation(internal.summons.post, {
        ...summonArgs(summon),
        body,
        first: posted.count === 0,
        place: where,
      });
      posted.count += 1;
    });
    const tally: Tally = { memoryLookups: 0, searches: 0 };
    const started = Date.now();
    const updatesIn: string = await ctx.runMutation(
      internal.bots.openConversation,
      { accountId: summon.accountId, bot: summon.bot.username },
    );
    const turn: Turn = {
      ...sender,
      accountId: summon.accountId,
      bot: summon.bot,
      conversationId: summon.conversationId,
      counted: (what) => {
        if (what === "search") tally.searches += 1;
        else tally.memoryLookups += 1;
      },
      ctx,
      lastHeardAt: found.message.sentAt,
      name: found.message.authorName,
      note: null,
      oldestSentAt,
      recalled: [],
      self,
      timeZone: await ctx.runQuery(internal.timeZones.of, {
        accountId: summon.accountId,
      }),
      updatesIn,
    };
    const prompt = await summonedPrompt(turn, {
      context: found,
      // Placed once, with the first message, so an answer isn't split.
      place: (chosen) => {
        if (posted.count === 0) where = chosen;
        typingIn = where;
        return where;
      },
      readEarlier: (before) =>
        ctx.runQuery(internal.summons.context, {
          ...summonArgs(summon),
          before,
        }),
    });
    const { models, options } = await replyRequest(ctx, turn, history, prompt, {
      speakers: true,
    });
    const results = await generateReply(options, models, sender, summon.bot);
    await ctx.runMutation(internal.usage.record, {
      ...usageOf(results, tally),
      accountId: summon.accountId,
      bot: summon.bot.username,
      cachedPart: await cachedPartHash(prompt.instructions, prompt.tools),
      conversationId: summon.conversationId,
      ms: Date.now() - started,
    });
  } finally {
    await typing.stop();
  }
}
