import type { ModelMessage } from "ai";
import type { PaginationOptions } from "convex/server";
import { parse } from "convex-helpers/validators";

import type {
  Message,
  MessageStatus,
  MessageWithMetadata,
} from "../../src/agent/validators";
import type { ActionCtx, MutationCtx, QueryCtx } from "./types";
import { internal } from "../../src/_generated/api";
import { serializeMessage } from "../../src/agent/mapping";
import { toUIMessages } from "../../src/agent/ui/to_ui_messages";
import { vMessageWithMetadata } from "../../src/agent/validators";
import { asId } from "./_ids";

export async function listMessages(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  {
    threadId,
    paginationOpts,
    excludeToolMessages,
    statuses,
  }: {
    threadId: string;
    paginationOpts: PaginationOptions;
    excludeToolMessages?: boolean;
    statuses?: MessageStatus[];
  },
) {
  if (paginationOpts.numItems === 0) {
    return {
      page: [],
      isDone: true,
      continueCursor: paginationOpts.cursor ?? "",
    };
  }
  return ctx.runQuery(internal.agent.messages.listMessagesByThreadId, {
    order: "desc",
    threadId: asId<"threads">(threadId),
    paginationOpts,
    excludeToolMessages,
    statuses,
  });
}

export async function listUIMessages(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  args: {
    threadId: string;
    paginationOpts: PaginationOptions;
  },
) {
  const result = await listMessages(ctx, args);
  return { ...result, page: toUIMessages(result.page) };
}

export interface SaveMessagesArgs {
  threadId: string;
  userId?: string | null;
  promptMessageId?: string;
  messages: (ModelMessage | Message)[];
  metadata?: Omit<MessageWithMetadata, "message">[];
  failPendingSteps?: boolean;
  pendingMessageId?: string;
}

export async function saveMessages(
  ctx: MutationCtx | ActionCtx,
  args: SaveMessagesArgs & {
    agentName?: string;
  },
) {
  const result = await ctx.runMutation(internal.agent.messages.addMessages, {
    threadId: asId<"threads">(args.threadId),
    userId: args.userId ?? undefined,
    agentName: args.agentName,
    promptMessageId: args.promptMessageId
      ? asId<"messages">(args.promptMessageId)
      : undefined,
    pendingMessageId: args.pendingMessageId
      ? asId<"messages">(args.pendingMessageId)
      : undefined,
    messages: await Promise.all(
      args.messages.map(async (m, i) => {
        const { message } = await serializeMessage(m);
        const base = args.metadata?.[i];
        return parse(vMessageWithMetadata, {
          ...base,
          message,
        });
      }),
    ),
    failPendingSteps: args.failPendingSteps ?? false,
  });
  return { messages: result.messages };
}

export type SaveMessageArgs = {
  threadId: string;
  userId?: string | null;
  promptMessageId?: string;
  metadata?: Omit<MessageWithMetadata, "message">;
  pendingMessageId?: string;
} & (
  | {
      prompt?: undefined;
      message: ModelMessage | Message;
    }
  | {
      prompt: string;
      message?: undefined;
    }
);

export async function saveMessage(
  ctx: MutationCtx | ActionCtx,
  args: SaveMessageArgs & {
    agentName?: string;
  },
) {
  const { messages } = await saveMessages(ctx, {
    threadId: args.threadId,
    userId: args.userId ?? undefined,
    agentName: args.agentName,
    promptMessageId: args.promptMessageId,
    pendingMessageId: args.pendingMessageId,
    messages:
      args.prompt !== undefined
        ? [{ role: "user", content: args.prompt }]
        : [args.message],
    metadata: args.metadata ? [args.metadata] : undefined,
  });
  const message = messages.at(-1);
  if (!message) {
    throw new Error("saveMessage produced no messages");
  }
  return { messageId: message._id, message };
}
