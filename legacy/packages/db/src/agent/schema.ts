import { defineTable } from "convex/server";
import { v } from "convex/values";

import {
  vEventType,
  vFinishReason,
  vLanguageModelCallWarning,
  vMessage,
  vMessageStatus,
  vProviderMetadata,
  vProviderOptions,
  vReasoningDetails,
  vSource,
  vSystemError,
  vSystemNotice,
  vThreadStatus,
  vUsage,
} from "./validators";

export const agentTables = {
  threads: defineTable({
    userId: v.optional(v.string()),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    status: vThreadStatus,
    parentThreadIds: v.optional(v.array(v.id("threads"))),

    // Id of the scheduled `streamResponse` action for the currently-active
    // generation. Used to cancel the action when the user aborts before it
    // starts running. Cleared when the action terminates or the user aborts.
    generationFnId: v.optional(v.id("_scheduled_functions")),
    pinned: v.optional(v.boolean()),
    updatedAt: v.optional(v.number()),
    followUpQuestions: v.optional(v.array(v.string())),

    // Client-generated UUID for instant-navigation UX. The URL lands on
    // `/chat/<clientId>` before the server has assigned `_id`. Route-path
    // queries resolve via `getMetadata`, which tries `normalizeId` first,
    // then this index.
    clientId: v.optional(v.string()),
  })
    .index("userId", ["userId"])
    .index("by_user_time", ["userId", "pinned", "updatedAt"])
    .index("clientId", ["clientId"])
    .searchIndex("title", { searchField: "title", filterFields: ["userId"] }),

  messages: defineTable({
    userId: v.optional(v.string()),
    threadId: v.id("threads"),
    order: v.number(),
    stepOrder: v.number(),
    error: v.optional(v.string()),
    status: vMessageStatus,

    // Context on how it was generated
    agentName: v.optional(v.string()),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    providerOptions: v.optional(vProviderOptions),

    // The result
    message: v.optional(vMessage),
    tool: v.boolean(),
    text: v.optional(v.string()),

    // Result metadata
    usage: v.optional(vUsage),
    providerMetadata: v.optional(vProviderMetadata),
    sources: v.optional(v.array(vSource)),
    warnings: v.optional(v.array(vLanguageModelCallWarning)),
    finishReason: v.optional(vFinishReason),
    reasoning: v.optional(v.string()),
    reasoningDetails: v.optional(vReasoningDetails),
    notices: v.optional(v.array(vSystemNotice)),
    errors: v.optional(v.array(vSystemError)),

    attachments: v.optional(v.array(v.id("files"))),
  })
    .index("threadId_status_tool_order_stepOrder", [
      "threadId",
      "status",
      "tool",
      "order",
      "stepOrder",
    ])
    .searchIndex("text_search", {
      searchField: "text",
      filterFields: ["userId", "threadId"],
    }),

  streamingMessages: defineTable({
    userId: v.optional(v.string()),
    agentName: v.optional(v.string()),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    providerOptions: v.optional(vProviderOptions),
    format: v.optional(
      v.union(v.literal("UIMessageChunk"), v.literal("TextStreamPart")),
    ),
    threadId: v.id("threads"),
    order: v.number(),
    stepOrder: v.number(),
    state: v.union(
      v.object({
        kind: v.literal("streaming"),
        lastHeartbeat: v.number(),
        timeoutFnId: v.optional(v.id("_scheduled_functions")),
      }),
      v.object({
        kind: v.literal("finished"),
        endedAt: v.number(),
        cleanupFnId: v.optional(v.id("_scheduled_functions")),
      }),
      v.object({ kind: v.literal("aborted"), reason: v.string() }),
    ),
  }).index("threadId_state_order_stepOrder", [
    "threadId",
    "state.kind",
    "order",
    "stepOrder",
  ]),

  streamDeltas: defineTable({
    streamId: v.id("streamingMessages"),
    start: v.number(),
    end: v.number(),
    parts: v.array(v.any()),
  }).index("streamId_start_end", ["streamId", "start", "end"]),

  // In-flight-only event log. Rows exist only while a generation cycle is
  // active (waiting/streaming); terminal paths (complete, abort, error)
  // delete the cycle's rows. Steady-state idle = 0 rows per thread. Thread
  // state derivation maps latest event → waiting/streaming, or idle when no
  // event exists. `generationId` scopes deletes so a late terminal from an
  // old cycle can't wipe a newer cycle's rows.
  threadEvents: defineTable({
    userId: v.optional(v.string()),
    threadId: v.id("threads"),
    timestamp: v.number(),
    eventType: vEventType,
    generationId: v.string(),
  })
    .index("threadId_timestamp", ["threadId", "timestamp"])
    .index("generationId", ["generationId"]),
};
