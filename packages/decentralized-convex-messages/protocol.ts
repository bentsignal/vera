import type { Infer } from "convex/values";
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

export const messagesProtocol = definePluginProtocol({
  name: "messages",
  mutations: {
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
  requires: { accounts: "1" },
  version: "1",
});
