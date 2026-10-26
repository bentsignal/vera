import { attachment } from "@decentralized-convex/messages";
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
import { botName } from "./schema";

// Development only: a bot (devBots.ts) writes to Vera Support (or Vera,
// with `"to":"vera"`) and the assistant's model answers, the way it answers
// someone in the app. For trying an assistant without a device:
//
//   npx convex run devSupport:write '{"username":"maya","body":"..."}'
//   npx convex run support:read '{"conversationId":"<id it returns>"}'
//
// `attachments` takes the app's attachment objects, such as an image
// already on the media CDN, for trying what a photo does.

export const write = internalAction({
  args: {
    attachments: v.optional(v.array(attachment)),
    body: v.string(),
    to: v.optional(botName),
    username: v.string(),
  },
  handler: async (
    ctx,
    { attachments = [], body, to = SUPPORT.username, username },
  ): Promise<string> => {
    requireDevTools();
    const bot = BOTS.find((candidate) => candidate.username === username);
    if (bot === undefined) throw new Error(`No dev bot named ${username}`);
    const accountId = botAddress(bot.username);
    const conversationId: string = await ctx.runMutation(
      internal.bots.openConversation,
      { accountId, bot: to },
    );
    await asAccount(ctx, botIdentity(bot), {
      args: {
        attachments,
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
      bot: to,
      conversationId,
    });
    return conversationId;
  },
});

export const reply = internalMutation({
  args: { accountId: v.string(), bot: botName, conversationId: v.string() },
  handler: async (ctx, { accountId, bot, conversationId }) => {
    requireDevTools();
    await scheduleReply(ctx, {
      accountId,
      bot,
      conversationId,
      wakeAt: Date.now(),
    });
  },
});
