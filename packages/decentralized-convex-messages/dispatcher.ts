import { defineComponentDispatchers } from "@decentralized-convex/server";
import { ConvexError } from "convex/values";

import { mutation, query } from "./_generated/server.js";
import { messagesProtocol } from "./protocol.ts";

export const { dispatchMutation, dispatchQuery } = defineComponentDispatchers({
  handlers: {
    mutations: {
      send: async (ctx, { args, identity }) => {
        const authorId = requireAccountId(identity);
        const body = args.body.trim();
        if (body.length === 0 || body.length > 4_000) {
          throw new ConvexError({ code: "INVALID_MESSAGE_BODY" });
        }

        const existing = await ctx.db
          .query("messages")
          .withIndex("by_message", (index) =>
            index.eq("messageId", args.messageId),
          )
          .unique();
        if (existing !== null) return toMessage(existing);

        const message = {
          authorId,
          authorName:
            identity?.name?.trim() ?? authorId.split("@")[0] ?? authorId,
          body,
          conversationId: args.conversationId,
          messageId: args.messageId,
          sentAt: Date.now(),
        };
        await ctx.db.insert("messages", message);
        return message;
      },
    },
    queries: {
      list: async (ctx, { args, identity }) => {
        requireAccountId(identity);
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_conversation", (index) =>
            index.eq("conversationId", args.conversationId),
          )
          .collect();
        return messages
          .map(toMessage)
          .sort(
            (left, right) =>
              left.sentAt - right.sentAt ||
              left.messageId.localeCompare(right.messageId),
          );
      },
    },
  },
  mutation,
  protocol: messagesProtocol,
  query,
});

function requireAccountId(
  identity: null | { accountId?: string; email?: string },
) {
  const accountId = (identity?.accountId ?? identity?.email)
    ?.trim()
    .toLowerCase();
  if (accountId?.includes("@") !== true) {
    throw new ConvexError({ code: "AUTHENTICATED_ACCOUNT_REQUIRED" });
  }
  return accountId;
}

function toMessage(message: {
  authorId: string;
  authorName: string;
  body: string;
  conversationId: string;
  messageId: string;
  sentAt: number;
}) {
  return {
    authorId: message.authorId,
    authorName: message.authorName,
    body: message.body,
    conversationId: message.conversationId,
    messageId: message.messageId,
    sentAt: message.sentAt,
  };
}
