import type { UIDataTypes, UIMessagePart, UITools } from "ai";
import { getErrorMessage } from "@ai-sdk/provider-utils";
import { assert } from "convex-helpers";

import type { UpdateContext } from "./part_handlers";
import type { AnyToolUIPart } from "./tool_part_builder";
import type { TextStreamPartFor } from "./update_text_stream";
import { mergeProviderMetadata } from "./provider_metadata";
import {
  buildDynamicToolPart,
  buildStaticToolPart,
  toolNameFromType,
} from "./tool_part_builder";

export type { AnyToolUIPart };

type ToolStreamPart = TextStreamPartFor<
  | "tool-input-start"
  | "tool-input-delta"
  | "tool-input-end"
  | "tool-call"
  | "tool-result"
  | "tool-error"
  | "tool-approval-request"
  | "tool-output-denied"
>;

export function isToolPart(
  part: UIMessagePart<UIDataTypes, UITools>,
): part is AnyToolUIPart {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

export function applyToolPart(ctx: UpdateContext, part: ToolStreamPart) {
  switch (part.type) {
    case "tool-input-start":
      return handleInputStart(ctx, part);
    case "tool-input-delta":
      return handleInputDelta(ctx, part);
    case "tool-input-end":
      return handleInputEnd(ctx, part);
    case "tool-call":
      return handleCall(ctx, part);
    case "tool-result":
      return handleResult(ctx, part);
    case "tool-error":
      return handleError(ctx, part);
    case "tool-approval-request":
      return handleApprovalRequest(ctx, part);
    case "tool-output-denied":
      return handleOutputDenied(ctx, part);
  }
}

function handleInputStart(
  ctx: UpdateContext,
  part: TextStreamPartFor<"tool-input-start">,
) {
  const newPart = part.dynamic
    ? buildDynamicToolPart({
        toolCallId: part.id,
        toolName: part.toolName,
        state: "input-streaming",
      })
    : buildStaticToolPart({
        toolCallId: part.id,
        toolName: part.toolName,
        state: "input-streaming",
        providerExecuted: part.providerExecuted,
      });
  ctx.toolPartsById.set(part.id, newPart);
  ctx.toolInputBuffers.set(part.id, "");
  ctx.message.parts.push(newPart);
}

function handleInputDelta(
  ctx: UpdateContext,
  part: TextStreamPartFor<"tool-input-delta">,
) {
  assert(
    ctx.toolPartsById.has(part.id),
    `Expected to find tool call part ${part.id} to update`,
  );
  const buffer = ctx.toolInputBuffers.get(part.id) ?? "";
  ctx.toolInputBuffers.set(part.id, buffer + part.delta);
}

function handleInputEnd(
  ctx: UpdateContext,
  part: TextStreamPartFor<"tool-input-end">,
) {
  const toUpdate = ctx.toolPartsById.get(part.id);
  assert(toUpdate, `Expected to find tool call part ${part.id} to update`);
  const input = parseInputBuffer(ctx.toolInputBuffers.get(part.id));
  const callProviderMetadata = mergeProviderMetadata(
    "callProviderMetadata" in toUpdate
      ? toUpdate.callProviderMetadata
      : undefined,
    part.providerMetadata,
  );
  const replacement = rebuildAsInputAvailable(
    toUpdate,
    input,
    callProviderMetadata,
  );
  replaceToolPart(ctx, toUpdate, replacement);
}

function handleCall(ctx: UpdateContext, part: TextStreamPartFor<"tool-call">) {
  const newPart = part.dynamic
    ? buildDynamicToolPart({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        state: "input-available",
        input: part.input,
        callProviderMetadata: part.providerMetadata,
      })
    : buildStaticToolPart({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        state: "input-available",
        input: part.input,
        providerExecuted: part.providerExecuted,
        callProviderMetadata: part.providerMetadata,
      });
  const existing = ctx.toolPartsById.get(part.toolCallId);
  if (existing) {
    replaceToolPart(ctx, existing, newPart);
  } else {
    ctx.toolPartsById.set(part.toolCallId, newPart);
    ctx.message.parts.push(newPart);
  }
}

function handleResult(
  ctx: UpdateContext,
  part: TextStreamPartFor<"tool-result">,
) {
  const toolCall = ctx.toolPartsById.get(part.toolCallId);
  assert(
    toolCall,
    `Expected to find tool call part ${part.toolCallId} to update with result`,
  );
  const common = {
    toolCallId: toolCall.toolCallId,
    state: "output-available" as const,
    input: asUnknown(part.input),
    output: asUnknown(part.output),
    preliminary: part.preliminary,
  };
  const replacement =
    toolCall.type === "dynamic-tool"
      ? buildDynamicToolPart({ ...common, toolName: toolCall.toolName })
      : buildStaticToolPart({
          ...common,
          toolName: toolNameFromType(toolCall.type),
          providerExecuted:
            "providerExecuted" in toolCall
              ? toolCall.providerExecuted
              : undefined,
        });
  replaceToolPart(ctx, toolCall, replacement);
}

function handleError(
  ctx: UpdateContext,
  part: TextStreamPartFor<"tool-error">,
) {
  const toolPart = ctx.toolPartsById.get(part.toolCallId);
  if (!toolPart) return;
  const common = {
    toolCallId: toolPart.toolCallId,
    state: "output-error" as const,
    input: asUnknown(part.input),
    errorText: getErrorMessage(part.error),
  };
  const replacement =
    toolPart.type === "dynamic-tool"
      ? buildDynamicToolPart({ ...common, toolName: toolPart.toolName })
      : buildStaticToolPart({
          ...common,
          toolName: toolNameFromType(toolPart.type),
        });
  replaceToolPart(ctx, toolPart, replacement);
}

function handleApprovalRequest(
  ctx: UpdateContext,
  part: TextStreamPartFor<"tool-approval-request">,
) {
  const toolCallId = part.toolCall.toolCallId;
  const toolPart = ctx.toolPartsById.get(toolCallId);
  if (!toolPart) {
    console.warn(`Expected tool call part ${toolCallId} for approval request`);
    return;
  }
  const common = {
    toolCallId: toolPart.toolCallId,
    state: "approval-requested" as const,
    input: "input" in toolPart ? toolPart.input : undefined,
    approval: { id: part.approvalId },
  };
  const replacement =
    toolPart.type === "dynamic-tool"
      ? buildDynamicToolPart({ ...common, toolName: toolPart.toolName })
      : buildStaticToolPart({
          ...common,
          toolName: toolNameFromType(toolPart.type),
        });
  replaceToolPart(ctx, toolPart, replacement);
}

function handleOutputDenied(
  ctx: UpdateContext,
  part: TextStreamPartFor<"tool-output-denied">,
) {
  const toolPart = ctx.toolPartsById.get(part.toolCallId);
  if (!toolPart) return;
  const existingApprovalId =
    "approval" in toolPart && toolPart.approval ? toolPart.approval.id : "";
  const common = {
    toolCallId: toolPart.toolCallId,
    state: "output-denied" as const,
    input: "input" in toolPart ? toolPart.input : undefined,
    approval: { id: existingApprovalId, approved: false },
  };
  const replacement =
    toolPart.type === "dynamic-tool"
      ? buildDynamicToolPart({ ...common, toolName: toolPart.toolName })
      : buildStaticToolPart({
          ...common,
          toolName: toolNameFromType(toolPart.type),
        });
  replaceToolPart(ctx, toolPart, replacement);
}

function rebuildAsInputAvailable(
  toolPart: AnyToolUIPart,
  input: unknown,
  callProviderMetadata: ReturnType<typeof mergeProviderMetadata>,
) {
  if (toolPart.type === "dynamic-tool") {
    return buildDynamicToolPart({
      toolCallId: toolPart.toolCallId,
      toolName: toolPart.toolName,
      state: "input-available",
      input,
      callProviderMetadata,
    });
  }
  return buildStaticToolPart({
    toolCallId: toolPart.toolCallId,
    toolName: toolNameFromType(toolPart.type),
    state: "input-available",
    input,
    callProviderMetadata,
  });
}

function replaceToolPart(
  ctx: UpdateContext,
  existing: AnyToolUIPart,
  replacement: AnyToolUIPart,
) {
  const idx = ctx.message.parts.indexOf(existing);
  if (idx >= 0) {
    ctx.message.parts[idx] = replacement;
  } else {
    ctx.message.parts.push(replacement);
  }
  ctx.toolPartsById.set(replacement.toolCallId, replacement);
}

function parseInputBuffer(buffer: string | undefined) {
  if (!buffer) return undefined;
  try {
    return asUnknown(JSON.parse(buffer));
  } catch {
    return buffer;
  }
}

// Narrowing helper: many AI SDK tool part fields are typed as `any` (inferred
// from the generic ToolSet). Funnelling them through an explicit `unknown`
// boundary keeps downstream consumers honest without needing a type assertion.
function asUnknown(value: unknown) {
  return value;
}
