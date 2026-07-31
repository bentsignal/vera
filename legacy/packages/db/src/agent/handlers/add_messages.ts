import { assert } from "convex-helpers";

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { MessageWithMetadata } from "../validators";
import { extractText, isTool } from "../shared";
import { getMaxMessage, publicMessage } from "./messages";
import { finishHandler } from "./streams";

export interface AddMessagesArgs {
  userId?: string;
  threadId: Id<"threads">;
  promptMessageId?: Id<"messages">;
  agentName?: string;
  messages: MessageWithMetadata[];
  failPendingSteps?: boolean;
  pendingMessageId?: Id<"messages">;
  hideFromUserIdSearch?: boolean;
  finishStreamId?: Id<"streamingMessages">;
}

async function failPendingForRestart(
  ctx: MutationCtx,
  threadId: Id<"threads">,
  promptMessage: Doc<"messages"> | null,
  pendingMessageId: Id<"messages"> | undefined,
) {
  const pendingMessages = await ctx.db
    .query("messages")
    .withIndex("threadId_status_tool_order_stepOrder", (q) =>
      q.eq("threadId", threadId).eq("status", "pending"),
    )
    .order("desc")
    .take(100);
  await Promise.all(
    pendingMessages
      .filter((m) => !promptMessage || m.order === promptMessage.order)
      .filter((m) => !pendingMessageId || m._id !== pendingMessageId)
      .map((m) =>
        ctx.db.patch(m._id, { status: "failed", error: "Restarting" }),
      ),
  );
}

async function resolveStartingOrder(
  ctx: MutationCtx,
  threadId: Id<"threads">,
  promptMessage: Doc<"messages"> | null,
  promptMessageId: Id<"messages"> | undefined,
) {
  if (promptMessageId) {
    assert(promptMessage, `Parent message ${promptMessageId} not found`);
    const fail = promptMessage.status === "failed";
    const error = fail
      ? (promptMessage.error ?? "The prompt message failed")
      : undefined;
    const maxMessage = await getMaxMessage(ctx, threadId, promptMessage.order);
    return {
      order: promptMessage.order,
      stepOrder: maxMessage?.stepOrder ?? promptMessage.stepOrder,
      fail,
      error,
    };
  }
  const maxMessage = await getMaxMessage(ctx, threadId);
  return {
    order: maxMessage?.order ?? -1,
    stepOrder: maxMessage?.stepOrder ?? -1,
    fail: false,
    error: undefined,
  };
}

interface BuildMessageDocArgs {
  base: {
    userId?: string;
    threadId: Id<"threads">;
    agentName?: string;
  };
  message: MessageWithMetadata;
  hideFromUserIdSearch: boolean | undefined;
  fail: boolean;
  error: string | undefined;
}

function buildMessageDoc({
  base,
  message,
  hideFromUserIdSearch,
  fail,
  error,
}: BuildMessageDocArgs) {
  return {
    ...base,
    ...message,
    tool: isTool(message.message),
    text: hideFromUserIdSearch ? undefined : extractText(message.message),
    status: fail ? ("failed" as const) : (message.status ?? "success"),
    error: fail ? error : message.error,
  };
}

async function applyToPendingMessage(
  ctx: MutationCtx,
  pendingMessageId: Id<"messages">,
  messageDoc: ReturnType<typeof buildMessageDoc>,
) {
  const pendingMessage = await ctx.db.get(pendingMessageId);
  assert(pendingMessage, `Pending msg ${pendingMessageId} not found`);
  const failed = pendingMessage.status === "failed";
  const finalDoc = failed
    ? {
        ...messageDoc,
        status: "failed" as const,
        error:
          `Trying to update a message that failed: ${pendingMessageId}, ` +
          `error: ${pendingMessage.error ?? messageDoc.error ?? "unknown"}`,
      }
    : messageDoc;
  await ctx.db.replace(pendingMessage._id, {
    ...finalDoc,
    order: pendingMessage.order,
    stepOrder: pendingMessage.stepOrder,
  });
  const replaced = await ctx.db.get(pendingMessage._id);
  assert(replaced, "Replaced message vanished");
  return replaced;
}

function nextOrder(
  message: MessageWithMetadata,
  promptMessage: Doc<"messages"> | null,
  current: { order: number; stepOrder: number },
  maxMessageOrder: number | undefined,
) {
  if (message.message.role === "user") {
    if (promptMessage?.order === current.order) {
      return { order: (maxMessageOrder ?? current.order) + 1, stepOrder: 0 };
    }
    return { order: current.order + 1, stepOrder: 0 };
  }
  return {
    order: current.order < 0 ? 0 : current.order,
    stepOrder: current.stepOrder + 1,
  };
}

async function resolveUserId(ctx: MutationCtx, args: AddMessagesArgs) {
  if (args.userId || !args.threadId) return args.userId;
  const thread = await ctx.db.get(args.threadId);
  assert(thread, `Thread ${args.threadId} not found`);
  return thread.userId;
}

export async function addMessagesHandler(
  ctx: MutationCtx,
  args: AddMessagesArgs,
) {
  const userId = await resolveUserId(ctx, args);
  const {
    failPendingSteps,
    finishStreamId,
    messages,
    promptMessageId,
    pendingMessageId,
    hideFromUserIdSearch,
    agentName,
    threadId,
  } = args;

  const promptMessage = promptMessageId
    ? await ctx.db.get(promptMessageId)
    : null;
  if (failPendingSteps) {
    await failPendingForRestart(ctx, threadId, promptMessage, pendingMessageId);
  }

  const { fail, error, ...initial } = await resolveStartingOrder(
    ctx,
    threadId,
    promptMessage,
    promptMessageId,
  );
  let { order, stepOrder } = initial;

  // eslint-disable-next-line no-restricted-syntax -- push targets need the element type on an empty array initializer
  const toReturn: Doc<"messages">[] = [];
  for (const [i, message] of messages.entries()) {
    const messageDoc = buildMessageDoc({
      base: { userId, threadId, agentName },
      message,
      hideFromUserIdSearch,
      fail,
      error,
    });
    if (i === 0 && pendingMessageId) {
      toReturn.push(
        await applyToPendingMessage(ctx, pendingMessageId, messageDoc),
      );
      continue;
    }
    const max = await getMaxMessage(ctx, threadId);
    const next = nextOrder(
      message,
      promptMessage,
      { order, stepOrder },
      max?.order,
    );
    order = next.order;
    stepOrder = next.stepOrder;
    const messageId = await ctx.db.insert("messages", {
      ...messageDoc,
      order,
      stepOrder,
    });
    const inserted = await ctx.db.get(messageId);
    assert(inserted, "Just-inserted message vanished");
    toReturn.push(inserted);
  }
  if (finishStreamId) {
    await finishHandler(ctx, { streamId: finishStreamId });
  }
  return { messages: toReturn.map(publicMessage) };
}
