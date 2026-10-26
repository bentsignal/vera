import { formatAddress, parseAddress } from "@decentralized-convex/address";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { botAddress, mutateAsBot, pageAsBot, queryAsBot, VERA } from "./bots";

// Vera's inbox for the operator's agents (the `support-inbox` agent skill):
// Vera's model answers everything people send it (vera.ts), but Shawn's
// agents can still read its conversations and write as Vera, such as to
// tell someone a fix for a report it didn't file is out.

/**
 * Operator command: `npx convex run veraInbox:list`. Vera's
 * conversations, unread first, each with its latest message.
 */
export const list = internalQuery({
  args: { unreadOnly: v.optional(v.boolean()) },
  handler: async (ctx, { unreadOnly }) => {
    const response = await queryAsBot(ctx, VERA, {
      args: {},
      type: "inbox",
    });
    if (response.type !== "inbox") throw new Error("Unexpected response");
    const vera = botAddress(VERA);
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
        people: conversation.members.filter((member) => member !== vera),
        unreadCount: conversation.unreadCount,
      }));
  },
});

/**
 * Operator command:
 * `npx convex run veraInbox:read '{"conversationId":"..."}'`. The latest
 * messages, oldest first; pass `before` (a `sentAtMs`) for older ones.
 */
export const read = internalQuery({
  args: { before: v.optional(v.number()), conversationId: v.string() },
  handler: async (ctx, { before, conversationId }) => {
    const page = await pageAsBot(ctx, VERA, conversationId, before);
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
 * `npx convex run veraInbox:send '{"conversationId":"...","body":"..."}'`,
 * or `"to":"someone@vera.chat"` instead of `conversationId` to message an
 * account directly. Sends as Vera.
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
            bot: VERA.username,
          });
    if (conversationId === undefined) {
      throw new ConvexError({ code: "CONVERSATION_OR_TO_REQUIRED" });
    }
    const messageId: string = await ctx.runMutation(internal.bots.post, {
      body,
      bot: VERA.username,
      conversationId,
    });
    return { conversationId, messageId };
  },
});

/**
 * Operator command:
 * `npx convex run veraInbox:markRead '{"conversationId":"..."}'`.
 */
export const markRead = internalMutation({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    await mutateAsBot(ctx, VERA, {
      args: { conversationId, readAt: Date.now() },
      type: "markRead",
    });
  },
});
