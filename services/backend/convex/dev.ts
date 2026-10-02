import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import {
  asAccount,
  botAddress,
  botIdentity,
  BOTS,
  listField,
  pick,
  queryAs,
  REPLIES,
  requireCaller,
  requireDevTools,
} from "./devBots";
import { seedDirects, seedGroup, seedProfiles, seedSpace } from "./devSeed";

// Development only. Bots are ordinary accounts on the dev deployment that
// post through the Messages plugin as themselves, so screens show other
// people without anyone making accounts by hand. Every entry point refuses to
// run unless DEV_TOOLS is "true", which production never sets.

/** Creates bot profiles and conversations with the signed-in account. */
export const seed = action({
  args: {},
  handler: async (ctx) => {
    const caller = await requireCaller(ctx);
    const me = { address: caller.accountId, name: caller.name };
    const bots = BOTS.map(botIdentity);
    const authors = BOTS.map((bot) => ({
      address: botAddress(bot.username),
      name: bot.name,
    }));
    await seedProfiles(ctx);
    await seedDirects(ctx, me, bots, authors);
    await seedGroup(ctx, me, authors);
    return { spaceId: await seedSpace(ctx, me, bots, authors) };
  },
});

/** Bots in a conversation answer the caller's latest message after a beat. */
export const replyToMe = action({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    const me = await requireCaller(ctx);
    const conversation = await queryAs(ctx, me, {
      args: { conversationId },
      type: "conversation",
    });
    const members = listField(conversation, "members");
    const responders = BOTS.filter((bot) =>
      members.includes(botAddress(bot.username)),
    );
    const seed = Date.now();
    const isDirect = conversationId.startsWith("direct:");
    const count = Math.min(responders.length, isDirect ? 1 : 2);
    for (let index = 0; index < count; index += 1) {
      const bot = pick(responders, seed + index);
      await ctx.scheduler.runAfter(
        1500 + index * 2000 + (seed % 1500),
        internal.dev.say,
        {
          body: pick(REPLIES, seed + index * 31),
          conversationId,
          username: bot.username,
        },
      );
    }
  },
});

export const say = internalAction({
  args: { body: v.string(), conversationId: v.string(), username: v.string() },
  handler: async (ctx, { body, conversationId, username }) => {
    requireDevTools();
    const bot = BOTS.find((candidate) => candidate.username === username);
    if (bot === undefined) return;
    await asAccount(ctx, botIdentity(bot), {
      args: {
        attachments: [],
        body,
        conversationId,
        messageId: crypto.randomUUID(),
      },
      type: "send",
    });
  },
});
