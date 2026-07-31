import { v } from "convex/values";

import type { StreamArgs } from "../../src/agent/validators";
import type { ActionCtx, MutationCtx, QueryCtx } from "./types";
import { internal } from "../../src/_generated/api";
import {
  vMessageDoc,
  vPaginationResult,
  vStreamDelta,
  vStreamMessage,
} from "../../src/agent/validators";
import { asId } from "./_ids";

export const vStreamMessagesReturnValue = v.object({
  ...vPaginationResult(vMessageDoc).fields,
  streams: v.optional(
    v.union(
      v.object({ kind: v.literal("list"), messages: v.array(vStreamMessage) }),
      v.object({ kind: v.literal("deltas"), deltas: v.array(vStreamDelta) }),
    ),
  ),
});

export async function syncStreams(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  {
    threadId,
    streamArgs,
    includeStatuses,
  }: {
    threadId: string;
    streamArgs?: StreamArgs | undefined;
    // By default, only streaming messages are included.
    includeStatuses?: ("streaming" | "finished" | "aborted")[];
  },
) {
  if (!streamArgs) return undefined;
  if (streamArgs.kind === "list") {
    return {
      kind: "list" as const,
      messages: await listStreams(ctx, {
        threadId,
        startOrder: streamArgs.startOrder,
        includeStatuses,
      }),
    };
  }
  return {
    kind: "deltas" as const,
    deltas: await ctx.runQuery(internal.agent.streams.listDeltas, {
      threadId: asId<"threads">(threadId),
      cursors: streamArgs.cursors.map((c) => ({
        streamId: asId<"streamingMessages">(c.streamId),
        cursor: c.cursor,
      })),
    }),
  };
}

export async function abortStream(
  ctx: MutationCtx | ActionCtx,
  args: { reason: string } & (
    | { streamId: string }
    | { threadId: string; order: number }
  ),
) {
  if ("streamId" in args) {
    return await ctx.runMutation(internal.agent.streams.abort, {
      reason: args.reason,
      streamId: asId<"streamingMessages">(args.streamId),
    });
  }
  return await ctx.runMutation(internal.agent.streams.abortByOrder, {
    reason: args.reason,
    threadId: asId<"threads">(args.threadId),
    order: args.order,
  });
}

export async function listStreams(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  {
    threadId,
    startOrder,
    includeStatuses,
  }: {
    threadId: string;
    startOrder?: number;
    includeStatuses?: ("streaming" | "finished" | "aborted")[];
  },
) {
  return ctx.runQuery(internal.agent.streams.list, {
    threadId: asId<"threads">(threadId),
    startOrder,
    statuses: includeStatuses,
  });
}
