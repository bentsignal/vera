import { v } from "convex/values";

import { providerMetadata, providerOptions } from "./shared";

export const vToolCallPart = v.union(
  v.object({
    type: v.literal("tool-call"),
    toolCallId: v.string(),
    toolName: v.string(),
    input: v.any(),
    /** @deprecated Use `input` instead. */
    args: v.optional(v.any()),
    providerExecuted: v.optional(v.boolean()),
    providerOptions,
    providerMetadata,
  }),
  v.object({
    type: v.literal("tool-call"),
    toolCallId: v.string(),
    toolName: v.string(),
    /** @deprecated Use `input` instead. */
    args: v.any(),
    input: v.optional(v.any()),
    providerExecuted: v.optional(v.boolean()),
    providerOptions,
    providerMetadata,
  }),
);

const vToolResultContent = v.array(
  v.union(
    v.object({ type: v.literal("text"), text: v.string() }),
    v.object({
      type: v.literal("image"),
      data: v.string(),
      mimeType: v.optional(v.string()),
    }),
  ),
);

export const vToolResultOutput = v.union(
  v.object({ type: v.literal("text"), value: v.string(), providerOptions }),
  v.object({ type: v.literal("json"), value: v.any(), providerOptions }),
  v.object({
    type: v.literal("error-text"),
    value: v.string(),
    providerOptions,
  }),
  v.object({ type: v.literal("error-json"), value: v.any(), providerOptions }),
  v.object({
    type: v.literal("execution-denied"),
    reason: v.optional(v.string()),
    providerOptions,
  }),
  v.object({
    type: v.literal("content"),
    value: v.array(
      v.union(
        v.object({
          type: v.literal("text"),
          text: v.string(),
          providerOptions,
        }),
        /** @deprecated Use `image-data` or `file-data` instead. */
        v.object({
          type: v.literal("media"),
          data: v.string(),
          mediaType: v.string(),
        }),
        v.object({
          type: v.literal("file-data"),
          data: v.string(),
          mediaType: v.string(),
          filename: v.optional(v.string()),
          providerOptions,
        }),
        v.object({
          type: v.literal("file-url"),
          url: v.string(),
          providerOptions,
        }),
        v.object({
          type: v.literal("file-id"),
          fileId: v.union(v.string(), v.record(v.string(), v.string())),
          providerOptions,
        }),
        v.object({
          type: v.literal("image-data"),
          data: v.string(),
          mediaType: v.string(),
          providerOptions,
        }),
        v.object({
          type: v.literal("image-url"),
          url: v.string(),
          providerOptions,
        }),
        v.object({
          type: v.literal("image-file-id"),
          fileId: v.union(v.string(), v.record(v.string(), v.string())),
          providerOptions,
        }),
        v.object({
          type: v.literal("custom"),
          providerOptions,
        }),
      ),
    ),
  }),
);

export const vToolApprovalRequest = v.object({
  type: v.literal("tool-approval-request"),
  approvalId: v.string(),
  toolCallId: v.string(),
  providerMetadata,
  providerOptions,
});

export const vToolApprovalResponse = v.object({
  type: v.literal("tool-approval-response"),
  approvalId: v.string(),
  approved: v.boolean(),
  reason: v.optional(v.string()),
  providerExecuted: v.optional(v.boolean()),
  providerMetadata,
  providerOptions,
});

export const vToolResultPart = v.object({
  type: v.literal("tool-result"),
  toolCallId: v.string(),
  toolName: v.string(),
  output: v.optional(vToolResultOutput),

  providerOptions,
  providerMetadata,
  providerExecuted: v.optional(v.boolean()),

  result: v.optional(v.any()),
  isError: v.optional(v.boolean()),
  args: v.optional(v.any()),
  experimental_content: v.optional(vToolResultContent),
});

export const vToolContent = v.array(
  v.union(vToolResultPart, vToolApprovalResponse),
);
