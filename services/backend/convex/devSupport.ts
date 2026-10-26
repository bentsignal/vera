import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { scheduleReply } from "./assistantHook";
import { SUPPORT } from "./bots";
import {
  asAccount,
  botAddress,
  botIdentity,
  BOTS,
  requireDevTools,
} from "./devBots";

// Development only: a bot (devBots.ts) writes to Vera Support and
// support's model answers, the way it answers someone in the app. For
// trying support without a device:
//
//   npx convex run devSupport:write '{"username":"maya","body":"..."}'
//   npx convex run support:read '{"conversationId":"<id it returns>"}'

export const write = internalAction({
  args: { body: v.string(), username: v.string() },
  handler: async (ctx, { body, username }): Promise<string> => {
    requireDevTools();
    const bot = BOTS.find((candidate) => candidate.username === username);
    if (bot === undefined) throw new Error(`No dev bot named ${username}`);
    const accountId = botAddress(bot.username);
    const conversationId: string = await ctx.runMutation(
      internal.bots.openConversation,
      { accountId, bot: SUPPORT.username },
    );
    await asAccount(ctx, botIdentity(bot), {
      args: {
        attachments: [],
        body,
        conversationId,
        messageId: crypto.randomUUID(),
      },
      type: "send",
    });
    // What the router's hook (assistantHook.ts) does for a message sent
    // from the app, which this one skips.
    await ctx.runMutation(internal.devSupport.reply, {
      accountId,
      conversationId,
    });
    return conversationId;
  },
});

export const reply = internalMutation({
  args: { accountId: v.string(), conversationId: v.string() },
  handler: async (ctx, { accountId, conversationId }) => {
    requireDevTools();
    await scheduleReply(ctx, {
      accountId,
      bot: SUPPORT.username,
      conversationId,
      wakeAt: Date.now(),
    });
  },
});
