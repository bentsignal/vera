import type { MutationCtx } from "./_generated/server";
import type { BotAccount } from "./botAccounts";
import { mentionsAssistant as mentionsWritten } from "../assistant-mentions";
import { components, internal } from "./_generated/api";
import { botAddress, isBotAddress } from "./botAccounts";

// Calling an assistant into a conversation (summons.ts), as the PDS
// router's `afterMutation` (assistantHook.ts) starts it: the mention
// noticed and the answer scheduled. The answer itself, and the models it
// uses, stay in summons.ts, which nothing on the router's path imports
// (docs/architecture.md, "Function bundles").

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
 * mentions an assistant outside its own direct messages, or the gate
 * judged a reply in its thread was for it (`heard`, summonThreads.ts):
 * it's answered once, right away. A send retried with the same ID isn't
 * answered again.
 */
export async function startSummon(
  ctx: MutationCtx,
  {
    accountId,
    bot,
    conversationId,
    heard,
    messageId,
  }: {
    accountId: string;
    bot: BotAccount;
    conversationId: string;
    heard?: true;
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
    heard,
    messageId,
  });
  await ctx.scheduler.runAfter(0, internal.summons.run, { messageId });
}
