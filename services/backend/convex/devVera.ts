import { attachment } from "@decentralized-convex/messages";
import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { scheduleReply } from "./assistantHook";
import {
  botAddress as assistantAddress,
  botIdentity as assistantIdentity,
  mutateAsBot,
  VERA,
} from "./bots";
import {
  asAccount,
  botAddress,
  botIdentity,
  BOTS,
  request,
  requireDevTools,
} from "./devBots";
import { SUPPORT, SUPPORT_WELCOME } from "./mergeSupport";

// Development only: a bot (devBots.ts) writes to Vera and Vera's model
// answers, the way it answers someone in the app. For trying it without a
// device:
//
//   npx convex run devVera:write '{"username":"maya","body":"..."}'
//   npx convex run veraInbox:read '{"conversationId":"<id it returns>"}'
//
// `attachments` takes the app's attachment objects, such as an image
// already on the media CDN, for trying what a photo does.

export const write = internalAction({
  args: {
    attachments: v.optional(v.array(attachment)),
    body: v.string(),
    username: v.string(),
  },
  handler: async (
    ctx,
    { attachments = [], body, username },
  ): Promise<string> => {
    requireDevTools();
    const bot = BOTS.find((candidate) => candidate.username === username);
    if (bot === undefined) throw new Error(`No dev bot named ${username}`);
    const accountId = botAddress(bot.username);
    const conversationId: string = await ctx.runMutation(
      internal.bots.openConversation,
      { accountId, bot: VERA.username },
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
    await ctx.runMutation(internal.devVera.reply, {
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
      bot: VERA.username,
      conversationId,
      wakeAt: Date.now(),
    });
  },
});

/**
 * A conversation with Vera Support as it was before the merge, for trying
 * `mergeSupport:run`: `{"accountId":"ios@<domain>"}`. Its messages go
 * back from an hour ago, a few minutes apart.
 */
export const seedSupport = internalMutation({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    requireDevTools();
    const opened = await mutateAsBot(ctx, SUPPORT, {
      args: { accountId },
      type: "openDirect",
    });
    if (opened.type !== "openDirect") throw new Error("Unexpected response");
    const { conversationId } = opened.value;
    const support = assistantAddress(SUPPORT);
    await ctx.runMutation(components.accounts.dispatcher.dispatchMutation, {
      ...request,
      identity: assistantIdentity(SUPPORT),
      operation: {
        args: { avatarUrl: null, displayName: SUPPORT.name },
        type: "upsertMyProfile",
      },
    });
    await ctx.runMutation(components.accounts.affiliations.setAffiliated, {
      accountId: support,
      affiliated: true,
    });
    const lines: [string, string][] = [
      [support, SUPPORT_WELCOME],
      [accountId, "photos in my group chat show up sideways"],
      [
        support,
        "Sorry about that. Does it happen with every photo, or only some?",
      ],
      [accountId, "only ones I take with the camera, not screenshots"],
      [
        support,
        "Thanks, I passed it to the team and will message you here when it's fixed.",
      ],
    ];
    const start = Date.now() - 60 * 60 * 1000;
    await ctx.runMutation(components.messages.history.importHistory, {
      conversationId,
      messages: lines.map(([authorId, body], index) => ({
        attachments: [],
        authorId,
        authorName: authorId === support ? SUPPORT.name : accountId,
        body,
        messageId: crypto.randomUUID(),
        sentAt: start + index * 5 * 60 * 1000,
      })),
    });
    return conversationId;
  },
});
