import { attachment } from "@decentralized-convex/messages";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import {
  asAccount,
  botAddress,
  botIdentity,
  BOTS,
  identityFor,
  latestMessageBy,
  listField,
  named,
  pick,
  queryAs,
  REPLIES,
  requireCaller,
  requireDevTools,
} from "./devBots";
import { seedReleaseTest } from "./devReleaseTest";
import {
  longThreadAnchor,
  seedDirects,
  seedGroup,
  seedProfiles,
  seedSpace,
  seedSpaceInvite,
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
    await seedSpaceInvite(ctx, me, bots);
    return { spaceId: await seedSpace(ctx, me, bots, authors) };
  },
});

/**
 * Conversations for a release test (see devReleaseTest.ts), for an account
 * on this PDS by username. Run from the CLI:
 * `npx convex run dev:releaseTest '{"username":"ios"}'`.
 */
export const releaseTest = internalAction({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    requireDevTools();
    const address = botAddress(username);
    await seedProfiles(ctx);
    return seedReleaseTest(
      ctx,
      await named(ctx, identityFor(address, username)),
    );
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

/**
 * Bots in a conversation answer the caller's latest message after a beat,
 * typing for a moment first (the second starts while the first still
 * types). In a group or channel, the first @mentions the caller.
 */
export const replyToMe = action({
  // With `threadId`, the bots answer in that thread.
  args: { conversationId: v.string(), threadId: v.optional(v.string()) },
  handler: async (ctx, { conversationId, threadId }) => {
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
      const typesAt = 400 + index * 900;
      await ctx.scheduler.runAfter(typesAt, internal.dev.type, {
        conversationId,
        threadId,
        typing: true,
        username: bot.username,
      });
      await ctx.scheduler.runAfter(
        typesAt + 2500 + ((seed + index * 500) % 1500),
        internal.dev.say,
        {
          body: pick(REPLIES, seed + index * 31),
          conversationId,
          mention:
            isDirect || index > 0
              ? undefined
              : { accountId: me.accountId, name: me.name },
          threadId,
          username: bot.username,
        },
      );
    }
  },
});

const BOT_REACTIONS = ["❤️", "👍", "😂", "🔥", "😮"];

/** A bot starts (or keeps up) typing, or stops. */
export const type = internalAction({
  args: {
    conversationId: v.string(),
    threadId: v.optional(v.string()),
    typing: v.boolean(),
    username: v.string(),
  },
  handler: async (ctx, { conversationId, threadId, typing, username }) => {
    requireDevTools();
    const bot = BOTS.find((candidate) => candidate.username === username);
    if (bot === undefined) return;
    await asAccount(ctx, botIdentity(bot), {
      args: { conversationId, threadId, typing },
      type: "setTyping",
    });
  },
});

/**
 * Every bot in a conversation (or `count` of them) types for `seconds`,
 * one after another, then stops, for trying typing indicators by hand:
 * `npx convex run dev:typingCrowd '{"conversationId":"..."}'`.
 */
export const typingCrowd = internalAction({
  args: {
    conversationId: v.string(),
    count: v.optional(v.number()),
    seconds: v.optional(v.number()),
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, { conversationId, count, seconds = 8, threadId }) => {
    requireDevTools();
    const bots = BOTS.slice(0, count ?? BOTS.length);
    for (const [index, bot] of bots.entries()) {
      const start = index * 700;
      // Typing times out unless it's kept up, as an app does while typing.
      for (let at = start; at < seconds * 1000; at += 3000) {
        await ctx.scheduler.runAfter(at, internal.dev.type, {
          conversationId,
          threadId,
          typing: true,
          username: bot.username,
        });
      }
      await ctx.scheduler.runAfter(
        seconds * 1000 + index * 700,
        internal.dev.type,
        { conversationId, threadId, typing: false, username: bot.username },
      );
    }
  },
});

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
  args: {
    /** Photos and files, at https URLs, for testing messages with media. */
    attachments: v.optional(v.array(attachment)),
    body: v.string(),
    conversationId: v.string(),
    /** Someone to @mention at the start. */
    mention: v.optional(v.object({ accountId: v.string(), name: v.string() })),
    threadId: v.optional(v.string()),
    username: v.string(),
  },
  handler: async (
    ctx,
    { attachments = [], body, conversationId, mention, threadId, username },
  ) => {
    requireDevTools();
    const bot = BOTS.find((candidate) => candidate.username === username);
    if (bot === undefined) return;
    await asAccount(ctx, botIdentity(bot), {
      args: {
        attachments,
        body: mention === undefined ? body : `@${mention.name} ${body}`,
        conversationId,
        mentions: mention === undefined ? undefined : [mention],
        messageId: crypto.randomUUID(),
        threadId,
        // Answered in the thread, so it stays there.
        threadOnly: threadId === undefined ? undefined : true,
      },
      type: "send",
    });
  },
});
