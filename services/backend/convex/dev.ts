import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import {
  asAccount,
  botAddress,
  botIdentity,
  BOTS,
  latestMessageBy,
  listField,
  pick,
  queryAs,
  REPLIES,
  requireCaller,
  requireDevTools,
} from "./devBots";
import {
  longThreadAnchor,
  seedDirects,
  seedGroup,
  seedProfiles,
  seedSpace,
} from "./devSeed";

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

/**
 * For testing old notifications: a long DM and a message about 200 back,
 * which the app opens at so paging both ways can be tried.
 */
export const longThreadMiddle = action({
  args: {},
  handler: async (ctx) => {
    const caller = await requireCaller(ctx);
    return longThreadAnchor(ctx, caller, {
      address: caller.accountId,
      name: caller.name,
    });
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
      // About half the time, a bot also reacts to what you sent.
      if ((seed + index) % 2 === 0) {
        await ctx.scheduler.runAfter(900 + index * 900, internal.dev.react, {
          callerId: me.accountId,
          conversationId,
          emoji: pick(BOT_REACTIONS, seed + index * 7),
          username: bot.username,
        });
      }
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

const BOT_REACTIONS = ["❤️", "👍", "😂", "🔥", "😮"];

/** A bot reacts to the caller's newest message, read when it runs. */
export const react = internalAction({
  args: {
    callerId: v.string(),
    conversationId: v.string(),
    emoji: v.string(),
    username: v.string(),
  },
  handler: async (ctx, { callerId, conversationId, emoji, username }) => {
    requireDevTools();
    const bot = BOTS.find((candidate) => candidate.username === username);
    if (bot === undefined) return;
    const page = await queryAs(ctx, botIdentity(bot), {
      args: { conversationId },
      type: "list",
    });
    const messageId = latestMessageBy(page, callerId);
    if (messageId === null) return;
    await asAccount(ctx, botIdentity(bot), {
      args: { conversationId, emoji, messageId, on: true },
      type: "react",
    });
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
