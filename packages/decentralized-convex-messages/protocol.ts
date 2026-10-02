import type { Infer } from "convex/values";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { v } from "convex/values";

import { decentralizedConvexPackage } from "./metadata.ts";

export const MESSAGE_PAGE_SIZE = 50;

export const attachment = v.object({
  durationMs: v.optional(v.number()),
  height: v.optional(v.number()),
  kind: v.union(v.literal("image"), v.literal("video"), v.literal("file")),
  mimeType: v.string(),
  name: v.string(),
  size: v.number(),
  thumbnailUrl: v.optional(v.string()),
  url: v.string(),
  width: v.optional(v.number()),
});

export type Attachment = Infer<typeof attachment>;

export const linkPreview = v.object({
  description: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  siteName: v.optional(v.string()),
  title: v.optional(v.string()),
  url: v.string(),
});

export type LinkPreview = Infer<typeof linkPreview>;

export const message = v.object({
  attachments: v.array(attachment),
  authorId: v.string(),
  authorName: v.string(),
  body: v.string(),
  conversationId: v.string(),
  linkPreview: v.union(v.null(), linkPreview),
  messageId: v.string(),
  sentAt: v.number(),
});

export type Message = Infer<typeof message>;

export const conversationKind = v.union(
  v.literal("direct"),
  v.literal("group"),
  v.literal("channel"),
);

export const conversation = v.object({
  conversationId: v.string(),
  kind: conversationKind,
  lastMessage: v.union(v.null(), message),
  members: v.array(v.string()),
  muted: v.boolean(),
  name: v.union(v.null(), v.string()),
  spaceId: v.union(v.null(), v.string()),
  unreadCount: v.number(),
  updatedAt: v.number(),
});

export type Conversation = Infer<typeof conversation>;

export const channel = v.object({
  conversationId: v.string(),
  name: v.string(),
  position: v.number(),
  unreadCount: v.number(),
});

export type Channel = Infer<typeof channel>;

export const spaceRole = v.union(v.literal("owner"), v.literal("member"));

export const space = v.object({
  channels: v.array(channel),
  members: v.array(v.object({ accountId: v.string(), role: spaceRole })),
  name: v.string(),
  role: spaceRole,
  spaceId: v.string(),
  unreadCount: v.number(),
});

export type Space = Infer<typeof space>;

export const messagePage = v.object({
  hasMore: v.boolean(),
  messages: v.array(message),
});

export const messagesProtocol = definePluginProtocol({
  lastChanged: decentralizedConvexPackage.lastChanged,
  name: "messages",
  mutations: {
    /** Opens (or returns) the one-to-one conversation with an address. */
    openDirect: defineOperation({
      args: v.object({ accountId: v.string() }),
      returns: v.object({ conversationId: v.string() }),
    }),
    createGroup: defineOperation({
      args: v.object({ members: v.array(v.string()), name: v.string() }),
      returns: v.object({ conversationId: v.string() }),
    }),
    renameGroup: defineOperation({
      args: v.object({ conversationId: v.string(), name: v.string() }),
      returns: v.null(),
    }),
    addGroupMembers: defineOperation({
      args: v.object({
        conversationId: v.string(),
        members: v.array(v.string()),
      }),
      returns: v.null(),
    }),
    leaveConversation: defineOperation({
      args: v.object({ conversationId: v.string() }),
      returns: v.null(),
    }),
    send: defineOperation({
      args: v.object({
        attachments: v.array(attachment),
        body: v.string(),
        conversationId: v.string(),
        messageId: v.string(),
      }),
      returns: message,
    }),
    markRead: defineOperation({
      args: v.object({ conversationId: v.string(), readAt: v.number() }),
      returns: v.null(),
    }),
    setMuted: defineOperation({
      args: v.object({ conversationId: v.string(), muted: v.boolean() }),
      returns: v.null(),
    }),
    createSpace: defineOperation({
      args: v.object({ name: v.string() }),
      returns: v.object({ spaceId: v.string() }),
    }),
    renameSpace: defineOperation({
      args: v.object({ name: v.string(), spaceId: v.string() }),
      returns: v.null(),
    }),
    addSpaceMembers: defineOperation({
      args: v.object({ members: v.array(v.string()), spaceId: v.string() }),
      returns: v.null(),
    }),
    removeSpaceMember: defineOperation({
      args: v.object({ accountId: v.string(), spaceId: v.string() }),
      returns: v.null(),
    }),
    createChannel: defineOperation({
      args: v.object({ name: v.string(), spaceId: v.string() }),
      returns: v.object({ conversationId: v.string() }),
    }),
    renameChannel: defineOperation({
      args: v.object({ conversationId: v.string(), name: v.string() }),
      returns: v.null(),
    }),
    deleteChannel: defineOperation({
      args: v.object({ conversationId: v.string() }),
      returns: v.null(),
    }),
    registerPushToken: defineOperation({
      args: v.object({ token: v.string() }),
      returns: v.null(),
    }),
    unregisterPushToken: defineOperation({
      args: v.object({ token: v.string() }),
      returns: v.null(),
    }),
  },
  queries: {
    inbox: defineOperation({
      args: v.object({}),
      returns: v.array(conversation),
    }),
    conversation: defineOperation({
      args: v.object({ conversationId: v.string() }),
      returns: v.union(v.null(), conversation),
    }),
    list: defineOperation({
      args: v.object({
        before: v.optional(v.number()),
        conversationId: v.string(),
      }),
      returns: messagePage,
    }),
    spaces: defineOperation({
      args: v.object({}),
      returns: v.array(space),
    }),
    space: defineOperation({
      args: v.object({ spaceId: v.string() }),
      returns: v.union(v.null(), space),
    }),
  },
  requires: { accounts: DECENTRALIZED_CONVEX_VERSION },
});
