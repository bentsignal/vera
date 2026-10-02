import { v } from "convex/values";

import { mutation } from "./_generated/server.js";
import { getConversation } from "./model.ts";
import { attachment } from "./protocol.ts";

/**
 * Inserts already-authored messages with their original timestamps, for
 * imports and development seed data. Component functions are callable only
 * by the host PDS, never by clients, and authors are not checked here.
 */
export const importHistory = mutation({
  args: {
    conversationId: v.string(),
    messages: v.array(
      v.object({
        attachments: v.array(attachment),
        authorId: v.string(),
        authorName: v.string(),
        body: v.string(),
        messageId: v.string(),
        sentAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, { conversationId, messages }) => {
    const conversation = await getConversation(ctx, conversationId);
    if (conversation === null) throw new Error("Conversation not found");
    let latest = conversation.updatedAt;
    for (const message of messages) {
      await ctx.db.insert("messages", { ...message, conversationId });
      latest = Math.max(latest, message.sentAt);
    }
    await ctx.db.patch(conversation._id, { updatedAt: latest });
    return null;
  },
});
