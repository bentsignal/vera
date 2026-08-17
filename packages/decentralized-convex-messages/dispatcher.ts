import {
  defineComponentDispatchers,
  routedQueryResult,
} from "@decentralized-convex/server";
import { ConvexError } from "convex/values";

import { mutation, query } from "./_generated/server.js";
import { messagesProtocol } from "./protocol.ts";

export const { dispatchMutation, dispatchQuery } = defineComponentDispatchers({
  handlers: {
    mutations: {
      putConversation: async (ctx, { args, identity }) => {
        const accountId = requireAccountId(identity);
        const participants = normalizeParticipants(args.participants);
        const existing = await ctx.db
          .query("conversations")
          .withIndex("by_account_conversation", (index) =>
            index
              .eq("accountId", accountId)
              .eq("conversationId", args.conversationId),
          )
          .unique();
        const conversation = {
          accountId,
          conversationId: args.conversationId,
          participants,
        };
        if (existing === null) {
          await ctx.db.insert("conversations", conversation);
        } else {
          await ctx.db.patch(existing._id, conversation);
        }
        return { conversationId: args.conversationId, participants };
      },
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
        const accountId = requireAccountId(identity);
        const conversation = await ctx.db
          .query("conversations")
          .withIndex("by_account_conversation", (index) =>
            index
              .eq("accountId", accountId)
              .eq("conversationId", args.conversationId),
          )
          .unique();
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_conversation", (index) =>
            index.eq("conversationId", args.conversationId),
          )
          .collect();
        return routedQueryResult(
          messages
            .map(toMessage)
            .sort(
              (left, right) =>
                left.sentAt - right.sentAt ||
                left.messageId.localeCompare(right.messageId),
            ),
          conversation?.participants ?? [],
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

function normalizeParticipants(participants: readonly string[]) {
  const normalized = [
    ...new Set(
      participants.map((participant) => participant.trim().toLowerCase()),
    ),
  ].filter(Boolean);
  if (normalized.length === 0) {
    throw new ConvexError({ code: "CONVERSATION_PARTICIPANTS_REQUIRED" });
  }
  return normalized.sort();
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
