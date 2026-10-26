import { formatAddress, parseAddress } from "@decentralized-convex/address";
import { ConvexError, v } from "convex/values";

import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  botAddress,
  ensureBotAccount,
  isBotAddress,
  mutateAsBot,
  pageAsBot,
  queryAsBot,
  SUPPORT,
  welcomeAccount as welcomeAs,
  welcomeEveryAccount,
} from "./bots";

// The support account: an ordinary, verified account on this PDS that
// welcomes every new account. A model answers what people send it
// (supportAgent.ts): it helps them describe a bug, files it on GitHub, and
// keeps them posted (supportReports.ts). The operator's agents can still
// read and answer its inbox with the commands below (see the
// `support-inbox` agent skill).

const WELCOME_MESSAGE =
  "Hi, welcome to Vera! If you notice any bugs or anything that isn't working right, tell me here. I'll pass it to the team and let you know when it's fixed.";

export function supportAddress() {
  return botAddress(SUPPORT);
}

/** Creates the support account if it doesn't exist yet. */
function ensureSupportAccount(ctx: ActionCtx) {
  return ensureBotAccount(ctx, SUPPORT);
}

/** Operator command: `npx convex run support:setup`. Safe to run again. */
export const setup = internalAction({
  args: {},
  handler: (ctx) => ensureSupportAccount(ctx),
});

/**
 * Sends the welcome message to a new account, unless support has already
 * written to them. Scheduled whenever an account is created.
 */
export const welcome = internalAction({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    if (isBotAddress(accountId)) return;
    await ensureSupportAccount(ctx);
    await welcomeAccount(ctx, accountId);
  },
});

function welcomeAccount(ctx: ActionCtx, accountId: string) {
  return welcomeAs(ctx, SUPPORT, accountId, WELCOME_MESSAGE);
}

/**
 * Operator command: `npx convex run support:welcomeEveryone`. Welcomes
 * accounts made before the support account existed. Accounts that already
 * heard from support are skipped.
 */
export const welcomeEveryone = internalAction({
  args: {},
  handler: (ctx) => welcomeEveryAccount(ctx, SUPPORT, WELCOME_MESSAGE),
});

/**
 * Operator command: `npx convex run support:inbox`. Support's
 * conversations, unread first, each with its latest message.
 */
export const inbox = internalQuery({
  args: { unreadOnly: v.optional(v.boolean()) },
  handler: async (ctx, { unreadOnly }) => {
    const response = await queryAsBot(ctx, SUPPORT, {
      args: {},
      type: "inbox",
    });
    if (response.type !== "inbox") throw new Error("Unexpected response");
    const support = supportAddress();
    return response.value
      .filter(
        (conversation) => unreadOnly !== true || conversation.unreadCount > 0,
      )
      .sort(
        (a, b) =>
          Number(b.unreadCount > 0) - Number(a.unreadCount > 0) ||
          b.updatedAt - a.updatedAt,
      )
      .map((conversation) => ({
        conversationId: conversation.conversationId,
        kind: conversation.kind,
        lastMessage:
          conversation.lastMessage === null
            ? null
            : {
                from: conversation.lastMessage.authorId,
                body: conversation.lastMessage.body,
                sentAt: new Date(conversation.lastMessage.sentAt).toISOString(),
              },
        name: conversation.name,
        people: conversation.members.filter((member) => member !== support),
        unreadCount: conversation.unreadCount,
      }));
  },
});

/**
 * Operator command:
 * `npx convex run support:read '{"conversationId":"..."}'`. The latest
 * messages, oldest first; pass `before` (a `sentAtMs`) for older ones.
 */
export const read = internalQuery({
  args: { before: v.optional(v.number()), conversationId: v.string() },
  handler: async (ctx, { before, conversationId }) => {
    const page = await pageAsBot(ctx, SUPPORT, conversationId, before);
    return {
      hasOlder: page.hasOlder,
      messages: page.messages.map((message) => ({
        attachments: message.attachments.map((attachment) => attachment.url),
        body: message.body,
        from: message.authorId,
        messageId: message.messageId,
        sentAt: new Date(message.sentAt).toISOString(),
        sentAtMs: message.sentAt,
      })),
    };
  },
});

/**
 * Operator command:
 * `npx convex run support:send '{"conversationId":"...","body":"..."}'`,
 * or `"to":"someone@vera.chat"` instead of `conversationId` to message an
 * account directly. Sends as the support account.
 */
export const send = internalAction({
  args: {
    body: v.string(),
    conversationId: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ conversationId: string; messageId: string }> => {
    const body = args.body.trim();
    if (body.length === 0) throw new ConvexError({ code: "EMPTY_MESSAGE" });
    const conversationId: string | undefined =
      args.to === undefined
        ? args.conversationId
        : await ctx.runMutation(internal.bots.openConversation, {
            accountId: formatAddress(parseAddress(args.to)),
            bot: SUPPORT.username,
          });
    if (conversationId === undefined) {
      throw new ConvexError({ code: "CONVERSATION_OR_TO_REQUIRED" });
    }
    const messageId: string = await ctx.runMutation(internal.bots.post, {
      body,
      bot: SUPPORT.username,
      conversationId,
    });
    return { conversationId, messageId };
  },
});

/**
 * Operator command:
 * `npx convex run support:markRead '{"conversationId":"..."}'`.
 */
export const markRead = internalMutation({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    await mutateAsBot(ctx, SUPPORT, {
      args: { conversationId, readAt: Date.now() },
      type: "markRead",
    });
  },
});
