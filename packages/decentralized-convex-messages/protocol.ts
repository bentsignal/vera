import type { Infer } from "convex/values";
import {
  DECENTRALIZED_CONVEX_LAST_CHANGED,
  DECENTRALIZED_CONVEX_VERSION,
} from "@decentralized-convex/core";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { v } from "convex/values";

export const message = v.object({
  authorId: v.string(),
  authorName: v.string(),
  body: v.string(),
  conversationId: v.string(),
  messageId: v.string(),
  sentAt: v.number(),
});

export type Message = Infer<typeof message>;

export const conversation = v.object({
  conversationId: v.string(),
  participants: v.array(v.string()),
});

export const messagesProtocol = definePluginProtocol({
  lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.messages,
  name: "messages",
  mutations: {
    putConversation: defineOperation({
      args: v.object({
        conversationId: v.string(),
        participants: v.array(v.string()),
      }),
      returns: conversation,
    }),
    send: defineOperation({
      args: v.object({
        body: v.string(),
        conversationId: v.string(),
        messageId: v.string(),
      }),
      returns: message,
    }),
  },
  queries: {
    list: defineOperation({
      args: v.object({ conversationId: v.string() }),
      returns: v.array(message),
    }),
  },
  requires: { accounts: DECENTRALIZED_CONVEX_VERSION },
});
