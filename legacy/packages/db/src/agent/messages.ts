import { assert, pick } from "convex-helpers";
import { partial } from "convex-helpers/validators";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";
import schema from "../schema";
import { addMessagesHandler } from "./handlers/add_messages";
import {
  deleteMessage,
  finalizeMessageHandler,
  listMessagesByThreadIdHandler,
  messageStatuses,
  orderedMessagesStream,
  publicMessage,
} from "./handlers/messages";
import { extractText, isTool } from "./shared";
import {
  vMessageDoc,
  vMessageStatus,
  vMessageWithMetadata,
  vPaginationResult,
} from "./validators";

export { messageStatuses };

export const deleteByIds = internalMutation({
  args: { messageIds: v.array(v.id("messages")) },
  returns: v.array(v.id("messages")),
  handler: async (ctx, args) => {
    const deletedMessageIds = await Promise.all(
      args.messageIds.map(async (id) => {
        const message = await ctx.db.get(id);
        if (message) {
          await deleteMessage(ctx, message);
          return id;
        }
        return null;
      }),
    );
    return deletedMessageIds.filter((id) => id !== null);
  },
});

export const deleteByOrder = internalMutation({
  args: {
    threadId: v.id("threads"),
    startOrder: v.number(),
    startStepOrder: v.optional(v.number()),
    endOrder: v.number(),
    endStepOrder: v.optional(v.number()),
  },
  returns: v.object({
    isDone: v.boolean(),
    lastOrder: v.optional(v.number()),
    lastStepOrder: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const messages = await orderedMessagesStream(ctx, {
      threadId: args.threadId,
      sortOrder: "asc",
      startOrder: args.startOrder,
      startOrderBound: "gte",
    })
      .narrow({
        lowerBound: args.startStepOrder
          ? [args.startOrder, args.startStepOrder]
          : [args.startOrder],
        lowerBoundInclusive: true,
        upperBound: args.endStepOrder
          ? [args.endOrder, args.endStepOrder]
          : [args.endOrder],
        upperBoundInclusive: false,
      })
      .take(64);
    await Promise.all(messages.map((m) => deleteMessage(ctx, m)));
    return {
      isDone: messages.length < 64,
      lastOrder: messages.at(-1)?.order,
      lastStepOrder: messages.at(-1)?.stepOrder,
    };
  },
});

export const addMessages = internalMutation({
  args: {
    userId: v.optional(v.string()),
    threadId: v.id("threads"),
    promptMessageId: v.optional(v.id("messages")),
    agentName: v.optional(v.string()),
    messages: v.array(vMessageWithMetadata),
    failPendingSteps: v.optional(v.boolean()),
    pendingMessageId: v.optional(v.id("messages")),
    hideFromUserIdSearch: v.optional(v.boolean()),
    finishStreamId: v.optional(v.id("streamingMessages")),
  },
  returns: v.object({ messages: v.array(vMessageDoc) }),
  handler: async (ctx, args) => addMessagesHandler(ctx, args),
});

export const finalizeMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
    result: v.union(
      v.object({ status: v.literal("success") }),
      v.object({ status: v.literal("failed"), error: v.string() }),
    ),
  },
  returns: v.null(),
  handler: finalizeMessageHandler,
});

export const updateMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
    patch: v.object(
      partial(
        pick(schema.tables.messages.validator.fields, [
          "message",
          "status",
          "error",
          "model",
          "provider",
          "providerOptions",
          "finishReason",
        ]),
      ),
    ),
  },
  returns: vMessageDoc,
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    assert(message, `Message ${args.messageId} not found`);

    const basePatch = { ...args.patch };
    const derived = args.patch.message
      ? {
          tool: isTool(args.patch.message),
          text: extractText(args.patch.message),
        }
      : {};
    await ctx.db.patch(args.messageId, { ...basePatch, ...derived });
    const updated = await ctx.db.get(args.messageId);
    assert(updated, "Updated message vanished");
    return publicMessage(updated);
  },
});

export const listMessagesByThreadIdArgs = {
  threadId: v.id("threads"),
  excludeToolMessages: v.optional(v.boolean()),
  /** What order to sort the messages in. To get the latest, use "desc". */
  order: v.union(v.literal("asc"), v.literal("desc")),
  paginationOpts: v.optional(paginationOptsValidator),
  statuses: v.optional(v.array(vMessageStatus)),
  upToAndIncludingMessageId: v.optional(v.id("messages")),
};

export const listMessagesByThreadId = internalQuery({
  args: listMessagesByThreadIdArgs,
  handler: async (ctx, args) => {
    const messages = await listMessagesByThreadIdHandler(ctx, args);
    return { ...messages, page: messages.page.map(publicMessage) };
  },
  returns: vPaginationResult(vMessageDoc),
});

export const getMessagesByIds = internalQuery({
  args: { messageIds: v.array(v.id("messages")) },
  handler: async (ctx, args) => {
    return (await Promise.all(args.messageIds.map((id) => ctx.db.get(id)))).map(
      (m) => (m ? publicMessage(m) : null),
    );
  },
  returns: v.array(v.union(v.null(), vMessageDoc)),
});
