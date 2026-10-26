import { v } from "convex/values";

import type { Id, TableNames } from "./_generated/dataModel.js";
import { mutation } from "./_generated/server.js";
import { getConversation } from "./model.ts";
import { attachment, linkCard, linkPreview } from "./protocol.ts";
import { scheduleNumbering } from "./sequences.ts";

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
        editedAt: v.optional(v.number()),
        linkPreview: v.optional(linkPreview),
        linkPreviews: v.optional(v.array(linkCard)),
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
    await scheduleNumbering(ctx, conversationId, 0);
    return null;
  },
});

/** Rows one `deleteConversation` call deletes, to stay within a mutation's limits. */
const DELETE_BATCH = 200;

/**
 * Deletes a conversation and everything stored with it, a batch at a time:
 * call again until it returns `{ done: true }`. For a host retiring one of
 * its own accounts' conversations (Vera folding its support account into
 * its assistant). Component functions are callable only by the host PDS.
 */
export const deleteConversation = mutation({
  args: { conversationId: v.string() },
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx, { conversationId }) => {
    let budget = DELETE_BATCH;
    async function remove(rows: readonly { _id: Id<TableNames> }[]) {
      for (const row of rows) await ctx.db.delete(row._id);
      budget -= rows.length;
      return budget <= 0;
    }
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_sent", (q) =>
        q.eq("conversationId", conversationId),
      )
      .take(budget);
    for (const message of messages) {
      const waits = await ctx.db
        .query("linkPreviewWaits")
        .withIndex("by_message", (q) => q.eq("messageId", message.messageId))
        .collect();
      await remove(waits);
    }
    if (await remove(messages)) return { done: false };
    const members = await ctx.db
      .query("members")
      .withIndex("by_conversation_account", (q) =>
        q.eq("conversationId", conversationId),
      )
      .collect();
    for (const member of members) {
      const mentions = await ctx.db
        .query("mentions")
        .withIndex("by_account_conversation_sent", (q) =>
          q
            .eq("accountId", member.accountId)
            .eq("conversationId", conversationId),
        )
        .take(budget);
      if (await remove(mentions)) return { done: false };
    }
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_conversation_reply", (q) =>
        q.eq("conversationId", conversationId),
      )
      .take(budget);
    for (const thread of threads) {
      const threadMembers = await ctx.db
        .query("threadMembers")
        .withIndex("by_thread_account", (q) =>
          q.eq("threadId", thread.threadId),
        )
        .collect();
      await remove(threadMembers);
    }
    if (await remove(threads)) return { done: false };
    const rest = await Promise.all([
      ctx.db
        .query("reactions")
        .withIndex("by_conversation_reacted", (q) =>
          q.eq("conversationId", conversationId),
        )
        .take(budget),
      ctx.db
        .query("typing")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversationId),
        )
        .collect(),
      ctx.db
        .query("memberEvents")
        .withIndex("by_conversation_at", (q) =>
          q.eq("conversationId", conversationId),
        )
        .take(budget),
      ctx.db
        .query("readStates")
        .withIndex("by_conversation_account", (q) =>
          q.eq("conversationId", conversationId),
        )
        .collect(),
      ctx.db
        .query("conversationChanges")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversationId),
        )
        .collect(),
    ]);
    if (await remove(rest.flat())) return { done: false };
    await remove(members);
    const conversation = await getConversation(ctx, conversationId);
    if (conversation !== null) await ctx.db.delete(conversation._id);
    return { done: true };
  },
});
