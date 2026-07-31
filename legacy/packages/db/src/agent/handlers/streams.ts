import type { WithoutSystemFields } from "convex/server";
import { pick } from "convex-helpers";
import { paginator } from "convex-helpers/server/pagination";
import { mergedStream, stream } from "convex-helpers/server/stream";

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { MessageWithMetadataInternal } from "../validators";
import { internal } from "../../_generated/api";
import schema from "../../schema";
import { deriveUIMessagesFromDeltas } from "../deltas";
import { fromUIMessages } from "../ui/from_ui_messages";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

export const MAX_DELTAS_PER_REQUEST = 1000;
export const MAX_DELTAS_PER_STREAM = 100;
export const TIMEOUT_INTERVAL = 10 * MINUTE;
export const DELETE_STREAM_DELAY = MINUTE * 5;

export function publicStreamMessage(m: Doc<"streamingMessages">) {
  return {
    streamId: m._id,
    status: m.state.kind,
    ...pick(m, [
      "format",
      "order",
      "stepOrder",
      "userId",
      "agentName",
      "model",
      "provider",
      "providerOptions",
    ]),
  };
}

export async function cleanupTimeoutFn(
  ctx: MutationCtx,
  stream: Doc<"streamingMessages">,
) {
  if (stream.state.kind === "streaming" && stream.state.timeoutFnId) {
    const timeoutFn = await ctx.db.system.get(stream.state.timeoutFnId);
    if (timeoutFn?.state.kind === "pending") {
      await ctx.scheduler.cancel(stream.state.timeoutFnId);
    }
  }
}

export async function heartbeatStream(
  ctx: MutationCtx,
  args: { streamId: Id<"streamingMessages"> },
) {
  const stream = await ctx.db.get(args.streamId);
  if (!stream) {
    console.warn("Stream not found", args.streamId);
    return;
  }
  if (stream.state.kind !== "streaming") return;
  if (Date.now() - stream.state.lastHeartbeat < TIMEOUT_INTERVAL / 4) return;
  if (!stream.state.timeoutFnId) {
    throw new Error("Stream has no timeout function");
  }
  const timeoutFn = await ctx.db.system.get(stream.state.timeoutFnId);
  if (!timeoutFn) throw new Error("Timeout function not found");
  if (timeoutFn.state.kind !== "pending") {
    throw new Error("Timeout function is not pending");
  }
  await ctx.scheduler.cancel(stream.state.timeoutFnId);
  const timeoutFnId = await ctx.scheduler.runAfter(
    TIMEOUT_INTERVAL,
    internal.agent.streams.timeoutStream,
    { streamId: args.streamId },
  );
  await ctx.db.patch(args.streamId, {
    state: { kind: "streaming", lastHeartbeat: Date.now(), timeoutFnId },
  });
}

export async function abortById(
  ctx: MutationCtx,
  args: {
    streamId: Id<"streamingMessages">;
    reason: string;
    finalDelta?: WithoutSystemFields<Doc<"streamDeltas">>;
  },
) {
  const stream = await ctx.db.get(args.streamId);
  if (!stream) throw new Error(`Stream not found: ${args.streamId}`);
  if (args.finalDelta) await ctx.db.insert("streamDeltas", args.finalDelta);
  if (stream.state.kind !== "streaming") return false;

  await cleanupTimeoutFn(ctx, stream);
  await ctx.db.patch(args.streamId, {
    state: { kind: "aborted", reason: args.reason },
  });
  return true;
}

export async function finishHandler(
  ctx: MutationCtx,
  args: {
    streamId: Id<"streamingMessages">;
    finalDelta?: WithoutSystemFields<Doc<"streamDeltas">>;
  },
) {
  if (args.finalDelta) await ctx.db.insert("streamDeltas", args.finalDelta);
  const stream = await ctx.db.get(args.streamId);
  if (!stream) throw new Error(`Stream not found: ${args.streamId}`);
  if (stream.state.kind !== "streaming") {
    console.warn(
      `Stream trying to finish ${args.streamId} but is ${stream.state.kind}`,
    );
    return;
  }
  await cleanupTimeoutFn(ctx, stream);
  const cleanupFnId = await ctx.scheduler.runAfter(
    DELETE_STREAM_DELAY,
    internal.agent.streams.deleteStreamAsync,
    { streamId: args.streamId },
  );
  await ctx.db.patch(args.streamId, {
    state: { kind: "finished", endedAt: Date.now(), cleanupFnId },
  });
}

export async function deletePageForStreamId(
  ctx: MutationCtx,
  args: { streamId: Id<"streamingMessages">; cursor?: string },
) {
  const deltas = await paginator(ctx.db, schema)
    .query("streamDeltas")
    .withIndex("streamId_start_end", (q) => q.eq("streamId", args.streamId))
    .paginate({
      numItems: MAX_DELTAS_PER_REQUEST,
      cursor: args.cursor ?? null,
    });
  await Promise.all(deltas.page.map((d) => ctx.db.delete(d._id)));
  if (deltas.isDone) {
    const stream = await ctx.db.get(args.streamId);
    if (stream) {
      await cleanupTimeoutFn(ctx, stream);
      if (stream.state.kind === "finished" && stream.state.cleanupFnId) {
        await ctx.scheduler.cancel(stream.state.cleanupFnId);
      }
      await ctx.db.delete(args.streamId);
    }
  }
  return deltas;
}

export async function deleteStreamsPageForThreadId(
  ctx: MutationCtx,
  args: { threadId: Id<"threads">; streamOrder?: number; deltaCursor?: string },
) {
  const allStreamMessages =
    schema.tables.streamingMessages.validator.fields.state.members
      .flatMap((state) => state.fields.kind.value)
      .map((stateKind) =>
        stream(ctx.db, schema)
          .query("streamingMessages")
          .withIndex("threadId_state_order_stepOrder", (q) =>
            q
              .eq("threadId", args.threadId)
              .eq("state.kind", stateKind)
              .gte("order", args.streamOrder ?? 0),
          ),
      );
  let deltaCursor = args.deltaCursor;
  const streamMessage = await mergedStream(allStreamMessages, [
    "threadId",
    "state.kind",
    "order",
    "stepOrder",
  ]).first();
  if (!streamMessage) {
    return { isDone: true, streamOrder: undefined, deltaCursor: undefined };
  }
  const result = await deletePageForStreamId(ctx, {
    streamId: streamMessage._id,
    cursor: deltaCursor,
  });
  if (result.isDone) deltaCursor = undefined;
  return { isDone: false, streamOrder: streamMessage.order, deltaCursor };
}

export async function getStreamingMessages(
  ctx: MutationCtx,
  threadId: Id<"threads">,
  order: number,
  stepOrder: number,
) {
  return mergedStream(
    (["aborted", "streaming", "finished"] as const).map((state) =>
      stream(ctx.db, schema)
        .query("streamingMessages")
        .withIndex("threadId_state_order_stepOrder", (q) =>
          q
            .eq("threadId", threadId)
            .eq("state.kind", state)
            .eq("order", order)
            .lte("stepOrder", stepOrder),
        )
        .order("desc"),
    ),
    ["stepOrder"],
  ).take(10);
}

const SAVE_FIELDS = [
  "message" as const,
  "status" as const,
  "finishReason" as const,
  "model" as const,
  "provider" as const,
  "providerMetadata" as const,
  "sources" as const,
  "reasoning" as const,
  "reasoningDetails" as const,
  "usage" as const,
  "warnings" as const,
  "error" as const,
];

export async function getStreamingMessagesWithMetadata(
  ctx: MutationCtx,
  {
    threadId,
    order,
    stepOrder,
  }: { threadId: Id<"threads">; order: number; stepOrder: number },
  metadata: { status: "success" | "failed"; error?: string },
) {
  const streamingMessages = await getStreamingMessages(
    ctx,
    threadId,
    order,
    stepOrder,
  );
  const messages = (
    await Promise.all(
      streamingMessages.map(async (streamingMessage) => {
        const deltas = await ctx.db
          .query("streamDeltas")
          .withIndex("streamId_start_end", (q) =>
            q.eq("streamId", streamingMessage._id),
          )
          .take(1000);
        const uiMessages = await deriveUIMessagesFromDeltas(
          threadId,
          [publicStreamMessage(streamingMessage)],
          deltas,
        );
        const numToSkip = stepOrder - streamingMessage.stepOrder;
        const fromUI = await fromUIMessages(uiMessages, streamingMessage);
        return fromUI
          .slice(numToSkip)
          .filter((m) => m.message !== undefined)
          .map((msg): MessageWithMetadataInternal => {
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- SAVE_FIELDS picks match MessageWithMetadataInternal shape; compiler can't verify Pick equivalence
            return {
              ...pick(msg, SAVE_FIELDS),
              ...metadata,
            } as unknown as MessageWithMetadataInternal;
          });
      }),
    )
  ).flat();
  return messages;
}
