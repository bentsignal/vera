import type { Infer } from "convex/values";
import { v } from "convex/values";

import { providerOptions } from "./shared";

export const vStreamCursor = v.object({
  streamId: v.string(),
  cursor: v.number(),
});
export type StreamCursor = Infer<typeof vStreamCursor>;

export const vStreamArgs = v.optional(
  v.union(
    v.object({ kind: v.literal("list"), startOrder: v.optional(v.number()) }),
    v.object({ kind: v.literal("deltas"), cursors: v.array(vStreamCursor) }),
  ),
);
export type StreamArgs = Infer<typeof vStreamArgs>;

export const vStreamMessage = v.object({
  streamId: v.string(),
  status: v.union(
    v.literal("streaming"),
    v.literal("finished"),
    v.literal("aborted"),
  ),
  format: v.optional(
    v.union(v.literal("UIMessageChunk"), v.literal("TextStreamPart")),
  ),
  order: v.number(),
  stepOrder: v.number(),
  userId: v.optional(v.string()),
  agentName: v.optional(v.string()),
  model: v.optional(v.string()),
  provider: v.optional(v.string()),
  providerOptions,
});
export type StreamMessage = Infer<typeof vStreamMessage>;

export const vStreamDelta = v.object({
  streamId: v.string(),
  start: v.number(),
  end: v.number(),
  parts: v.array(v.any()),
});
export type StreamDelta = Infer<typeof vStreamDelta>;
