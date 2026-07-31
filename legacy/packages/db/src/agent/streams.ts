import { omit, pick } from "convex-helpers";
import { mergedStream, stream } from "convex-helpers/server/stream";
import { v } from "convex/values";

import type { StreamDelta } from "./validators";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import schema from "../schema";
import {
  abortById,
  deletePageForStreamId,
  deleteStreamsPageForThreadId,
  finishHandler,
  heartbeatStream,
  MAX_DELTAS_PER_REQUEST,
  MAX_DELTAS_PER_STREAM,
  publicStreamMessage,
  TIMEOUT_INTERVAL,
} from "./handlers/streams";
import { vStreamDelta, vStreamMessage } from "./validators";

const deltaValidator = schema.tables.streamDeltas.validator;

export const addDelta = internalMutation({
  args: deltaValidator,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const stream = await ctx.db.get(args.streamId);
    if (!stream) {
      console.warn("Stream not found", args.streamId);
      return false;
    }
    if (stream.state.kind !== "streaming") return false;
    await ctx.db.insert("streamDeltas", args);
    await heartbeatStream(ctx, { streamId: args.streamId });
    return true;
  },
});

export const listDeltas = internalQuery({
  args: {
    threadId: v.id("threads"),
    cursors: v.array(
      v.object({ streamId: v.id("streamingMessages"), cursor: v.number() }),
    ),
  },
  returns: v.array(vStreamDelta),
  handler: async (ctx, args) => {
    let totalDeltas = 0;
    // eslint-disable-next-line no-restricted-syntax -- array starts empty; annotation needed for push targets
    const deltas: StreamDelta[] = [];
    for (const cursor of args.cursors) {
      const streamDeltas = await ctx.db
        .query("streamDeltas")
        .withIndex("streamId_start_end", (q) =>
          q.eq("streamId", cursor.streamId).gte("start", cursor.cursor),
        )
        .take(
          Math.min(MAX_DELTAS_PER_STREAM, MAX_DELTAS_PER_REQUEST - totalDeltas),
        );
      totalDeltas += streamDeltas.length;
      deltas.push(
        ...streamDeltas.map((d) =>
          pick(d, ["streamId", "start", "end", "parts"]),
        ),
      );
      if (totalDeltas >= MAX_DELTAS_PER_REQUEST) break;
    }
    return deltas;
  },
});

export const create = internalMutation({
  args: omit(schema.tables.streamingMessages.validator.fields, ["state"]),
  returns: v.id("streamingMessages"),
  handler: async (ctx, args) => {
    const state = { kind: "streaming" as const, lastHeartbeat: Date.now() };
    const streamId = await ctx.db.insert("streamingMessages", {
      ...args,
      state,
    });
    const timeoutFnId = await ctx.scheduler.runAfter(
      TIMEOUT_INTERVAL,
      internal.agent.streams.timeoutStream,
      { streamId },
    );
    await ctx.db.patch(streamId, { state: { ...state, timeoutFnId } });
    return streamId;
  },
});

export const list = internalQuery({
  args: {
    threadId: v.id("threads"),
    startOrder: v.optional(v.number()),
    statuses: v.optional(
      v.array(
        v.union(
          v.literal("streaming"),
          v.literal("finished"),
          v.literal("aborted"),
        ),
      ),
    ),
  },
  returns: v.array(vStreamMessage),
  handler: async (ctx, args) => {
    const statuses = args.statuses ?? ["streaming"];
    const messages = await mergedStream(
      statuses.map((status) =>
        stream(ctx.db, schema)
          .query("streamingMessages")
          .withIndex("threadId_state_order_stepOrder", (q) =>
            q
              .eq("threadId", args.threadId)
              .eq("state.kind", status)
              .gte("order", args.startOrder ?? 0),
          )
          .order("desc"),
      ),
      ["order", "stepOrder"],
    ).take(100);

    return messages.map((m) => publicStreamMessage(m));
  },
});

export const abortByOrder = internalMutation({
  args: { threadId: v.id("threads"), order: v.number(), reason: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const streams = await ctx.db
      .query("streamingMessages")
      .withIndex("threadId_state_order_stepOrder", (q) =>
        q
          .eq("threadId", args.threadId)
          .eq("state.kind", "streaming")
          .eq("order", args.order),
      )
      .take(100);
    for (const s of streams) {
      await abortById(ctx, { streamId: s._id, reason: args.reason });
    }
    return streams.length > 0;
  },
});

export const abort = internalMutation({
  args: {
    streamId: v.id("streamingMessages"),
    reason: v.string(),
    finalDelta: v.optional(deltaValidator),
  },
  returns: v.boolean(),
  handler: abortById,
});

export const finish = internalMutation({
  args: {
    streamId: v.id("streamingMessages"),
    finalDelta: v.optional(deltaValidator),
  },
  returns: v.null(),
  handler: finishHandler,
});

export const heartbeat = internalMutation({
  args: { streamId: v.id("streamingMessages") },
  returns: v.null(),
  handler: heartbeatStream,
});

export const timeoutStream = internalMutation({
  args: { streamId: v.id("streamingMessages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stream = await ctx.db.get(args.streamId);
    if (stream?.state.kind !== "streaming") {
      console.warn("Stream not found", args.streamId);
      return;
    }
    await ctx.db.patch(args.streamId, {
      state: { kind: "aborted", reason: "timeout" },
    });
  },
});

export const deleteStreamsPageForThreadIdMutation = internalMutation({
  args: {
    threadId: v.id("threads"),
    streamOrder: v.optional(v.number()),
    deltaCursor: v.optional(v.string()),
  },
  returns: v.object({
    isDone: v.boolean(),
    streamOrder: v.optional(v.number()),
    deltaCursor: v.optional(v.string()),
  }),
  handler: deleteStreamsPageForThreadId,
});

export const deleteAllStreamsForThreadIdAsync = internalMutation({
  args: {
    threadId: v.id("threads"),
    streamOrder: v.optional(v.number()),
    deltaCursor: v.optional(v.string()),
  },
  returns: v.object({
    isDone: v.boolean(),
    streamOrder: v.optional(v.number()),
    deltaCursor: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const result = await deleteStreamsPageForThreadId(ctx, args);
    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.agent.streams.deleteAllStreamsForThreadIdAsync,
        {
          threadId: args.threadId,
          streamOrder: result.streamOrder,
          deltaCursor: result.deltaCursor,
        },
      );
    } else {
      await ctx.db.delete(args.threadId);
    }
    return result;
  },
});

export const deleteStreamSync = internalMutation({
  args: { streamId: v.id("streamingMessages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    let deltas = await deletePageForStreamId(ctx, args);
    while (!deltas.isDone) {
      deltas = await deletePageForStreamId(ctx, {
        ...args,
        cursor: deltas.continueCursor,
      });
    }
  },
});

export const deleteStreamAsync = internalMutation({
  args: { streamId: v.id("streamingMessages"), cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await deletePageForStreamId(ctx, args);
    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.agent.streams.deleteStreamAsync,
        {
          streamId: args.streamId,
          cursor: result.continueCursor,
        },
      );
    }
  },
});

export const deleteAllStreamsForThreadIdSync = internalAction({
  args: { threadId: v.id("threads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    let result = await ctx.runMutation(
      internal.agent.streams.deleteStreamsPageForThreadIdMutation,
      args,
    );
    while (!result.isDone) {
      result = await ctx.runMutation(
        internal.agent.streams.deleteStreamsPageForThreadIdMutation,
        {
          ...args,
          streamOrder: result.streamOrder,
          deltaCursor: result.deltaCursor,
        },
      );
    }
  },
});
