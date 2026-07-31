import type { PaginationOptions } from "convex/server";
import { assert } from "convex-helpers";
import { mergedStream, stream } from "convex-helpers/server/stream";

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { MessageDoc, MessageStatus } from "../validators";
import schema from "../../schema";
import { DEFAULT_RECENT_MESSAGES } from "../shared";
import { vMessageDoc } from "../validators";
import { addMessagesHandler } from "./add_messages";
import { getStreamingMessagesWithMetadata } from "./streams";

export function publicMessage(message: Doc<"messages">) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Doc<"messages"> widens status/role discriminants; MessageDoc re-narrows them for public consumption
  return message as unknown as MessageDoc;
}

export async function deleteMessage(
  ctx: MutationCtx,
  messageDoc: Doc<"messages">,
) {
  await ctx.db.delete(messageDoc._id);
}

export const messageStatuses = vMessageDoc.fields.status.members.map(
  (m) => m.value,
);

export function orderedMessagesStream(
  ctx: QueryCtx,
  args: {
    threadId: Id<"threads">;
    sortOrder: "asc" | "desc";
    startOrder?: number;
    startOrderBound?: "gte" | "eq";
  },
) {
  return mergedStream(
    [true, false].flatMap((tool) =>
      messageStatuses.map((status) =>
        stream(ctx.db, schema)
          .query("messages")
          .withIndex("threadId_status_tool_order_stepOrder", (q) => {
            const qq = q
              .eq("threadId", args.threadId)
              .eq("status", status)
              .eq("tool", tool);
            if (args.startOrder !== undefined) {
              if (args.startOrderBound === "gte") {
                return qq.gte("order", args.startOrder);
              }
              return qq.eq("order", args.startOrder);
            }
            return qq;
          })
          .order(args.sortOrder),
      ),
    ),
    ["order", "stepOrder"],
  );
}

export async function getMaxMessage(
  ctx: QueryCtx,
  threadId: Id<"threads">,
  order?: number,
) {
  return orderedMessagesStream(ctx, {
    threadId,
    sortOrder: "desc",
    startOrder: order,
    startOrderBound: "eq",
  }).first();
}

interface ListMessagesArgs {
  threadId: Id<"threads">;
  excludeToolMessages?: boolean;
  order?: "asc" | "desc";
  paginationOpts?: PaginationOptions;
  statuses?: MessageStatus[];
  upToAndIncludingMessageId?: Id<"messages">;
}

export async function listMessagesByThreadIdHandler(
  ctx: QueryCtx,
  args: ListMessagesArgs,
) {
  const statuses = args.statuses ?? messageStatuses;
  const last =
    args.upToAndIncludingMessageId &&
    (await ctx.db.get(args.upToAndIncludingMessageId));
  assert(
    !last || last.threadId === args.threadId,
    "upToAndIncludingMessageId must be a message in the thread",
  );
  const toolOptions = args.excludeToolMessages ? [false] : [true, false];
  const order = args.order ?? "desc";
  const streams = toolOptions.flatMap((tool) =>
    statuses.map((status) =>
      stream(ctx.db, schema)
        .query("messages")
        .withIndex("threadId_status_tool_order_stepOrder", (q) => {
          const qq = q
            .eq("threadId", args.threadId)
            .eq("status", status)
            .eq("tool", tool);
          if (last) return qq.lte("order", last.order);
          return qq;
        })
        .order(order)
        // eslint-disable-next-line @typescript-eslint/require-await -- filterWith expects an async predicate
        .filterWith(async (m) => !last || m.order <= last.order),
    ),
  );
  const messages = await mergedStream(streams, ["order", "stepOrder"]).paginate(
    args.paginationOpts ?? {
      numItems: DEFAULT_RECENT_MESSAGES,
      cursor: null,
    },
  );
  if (messages.page.length === 0) messages.isDone = true;
  return messages;
}

export async function finalizeMessageHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    result: { status: "success" } | { status: "failed"; error: string };
  },
) {
  const { messageId, result } = args;
  const message = await ctx.db.get(messageId);
  assert(message, `Message ${messageId} not found`);
  if (message.status !== "pending") {
    console.debug(
      "Trying to finalize a message that's already",
      message.status,
    );
    return;
  }
  if (!message.message?.content.length) {
    const messages = await getStreamingMessagesWithMetadata(
      ctx,
      message,
      result,
    );
    if (messages.length > 0) {
      await addMessagesHandler(ctx, {
        messages,
        threadId: message.threadId,
        agentName: message.agentName,
        failPendingSteps: false,
        pendingMessageId: messageId,
        userId: message.userId,
      });
      return;
    }
  }
  if (result.status === "failed") {
    await ctx.db.patch(messageId, { status: "failed", error: result.error });
  } else {
    await ctx.db.patch(messageId, { status: "success" });
  }
}
