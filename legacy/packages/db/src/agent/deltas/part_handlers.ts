import type { ReasoningUIPart, TextStreamPart, TextUIPart, ToolSet } from "ai";

import type { UIMessage } from "../ui/types";
import type { AnyToolUIPart } from "./tool_handlers";
import type { TextStreamPartFor } from "./update_text_stream";
import { mergeProviderMetadata } from "./provider_metadata";
import { applyToolPart, isToolPart } from "./tool_handlers";

type Part = TextStreamPart<ToolSet>;

export interface UpdateContext {
  message: UIMessage;
  textPartsById: Map<string, TextUIPart>;
  toolPartsById: Map<string, AnyToolUIPart>;
  reasoningPartsById: Map<string, ReasoningUIPart>;
  // Tool input deltas accumulate as a JSON string in a side buffer, then the
  // parsed object lands on the part in `tool-input-end` / `tool-call`.
  toolInputBuffers: Map<string, string>;
}

export function buildContext(message: UIMessage) {
  const toolPartsById = new Map<string, AnyToolUIPart>();
  for (const p of message.parts) {
    if (isToolPart(p)) {
      toolPartsById.set(p.toolCallId, p);
    }
  }
  return {
    message,
    textPartsById: new Map<string, TextUIPart>(),
    toolPartsById,
    reasoningPartsById: new Map<string, ReasoningUIPart>(),
    toolInputBuffers: new Map<string, string>(),
  } satisfies UpdateContext;
}

export function applyPart(ctx: UpdateContext, part: Part) {
  if (isTextPart(part)) {
    handleText(ctx, part);
    return;
  }
  if (isReasoningPart(part)) {
    handleReasoning(ctx, part);
    return;
  }
  if (isToolStreamPart(part)) {
    applyToolPart(ctx, part);
    return;
  }
  if (part.type === "source") {
    handleSource(ctx, part);
    return;
  }
  if (part.type === "abort") {
    ctx.message.status = "failed";
    return;
  }
  if (part.type === "error") {
    ctx.message.status = "failed";
    console.warn("Generation failed with error", part.error);
    return;
  }
  if (isIgnoredPart(part)) {
    return;
  }
  // Intentional: new TextStreamPart types from future AI SDK versions trigger
  // a runtime warning rather than a compile error, allowing graceful degradation.
  console.warn(`Received unexpected part: ${JSON.stringify(part)}`);
}

export function finalizeReasoning(message: UIMessage) {
  // Close any streaming reasoning parts once any other content follows them.
  const upTo = message.parts.length - 1;
  for (let i = 0; i < upTo; i++) {
    const part = message.parts.at(i);
    if (part?.type === "reasoning" && part.state === "streaming") {
      part.state = "done";
    }
  }
}

function isTextPart(
  part: Part,
): part is TextStreamPartFor<"text-start" | "text-delta"> {
  return part.type === "text-start" || part.type === "text-delta";
}

function isReasoningPart(
  part: Part,
): part is TextStreamPartFor<
  "reasoning-start" | "reasoning-delta" | "reasoning-end"
> {
  return (
    part.type === "reasoning-start" ||
    part.type === "reasoning-delta" ||
    part.type === "reasoning-end"
  );
}

function isToolStreamPart(
  part: Part,
): part is TextStreamPartFor<
  | "tool-input-start"
  | "tool-input-delta"
  | "tool-input-end"
  | "tool-call"
  | "tool-result"
  | "tool-error"
  | "tool-approval-request"
  | "tool-output-denied"
> {
  return (
    part.type === "tool-input-start" ||
    part.type === "tool-input-delta" ||
    part.type === "tool-input-end" ||
    part.type === "tool-call" ||
    part.type === "tool-result" ||
    part.type === "tool-error" ||
    part.type === "tool-approval-request" ||
    part.type === "tool-output-denied"
  );
}

function isIgnoredPart(part: Part) {
  return (
    part.type === "file" ||
    part.type === "text-end" ||
    part.type === "finish-step" ||
    part.type === "finish" ||
    part.type === "raw" ||
    part.type === "start-step" ||
    part.type === "start"
  );
}

function handleText(
  ctx: UpdateContext,
  part: TextStreamPartFor<"text-start" | "text-delta">,
) {
  const existing = ctx.textPartsById.get(part.id);
  const textPart = existing ?? findOrCreateTextPart(ctx, part);
  if (part.type === "text-delta") {
    textPart.text += part.text;
    textPart.providerMetadata = mergeProviderMetadata(
      textPart.providerMetadata,
      part.providerMetadata,
    );
  }
}

function findOrCreateTextPart(
  ctx: UpdateContext,
  part: TextStreamPartFor<"text-start" | "text-delta">,
) {
  const lastPart = ctx.message.parts.at(-1);
  if (lastPart?.type === "text") {
    ctx.textPartsById.set(part.id, lastPart);
    return lastPart;
  }
  const textPart = {
    type: "text",
    text: "",
    providerMetadata: part.providerMetadata,
  } satisfies TextUIPart;
  ctx.textPartsById.set(part.id, textPart);
  ctx.message.parts.push(textPart);
  return textPart;
}

function handleReasoning(
  ctx: UpdateContext,
  part: TextStreamPartFor<
    "reasoning-start" | "reasoning-delta" | "reasoning-end"
  >,
) {
  if (part.type === "reasoning-end") {
    const reasoningPart = findReasoningPart(ctx, part.id);
    if (reasoningPart) {
      reasoningPart.state = "done";
    } else {
      console.warn(
        `Expected to find reasoning part ${part.id} to finish, but found none`,
      );
    }
    return;
  }
  const existing = ctx.reasoningPartsById.get(part.id);
  const reasoningPart = existing ?? findOrCreateReasoningPart(ctx, part);
  if (part.type === "reasoning-delta") {
    reasoningPart.text += part.text;
    reasoningPart.providerMetadata = mergeProviderMetadata(
      reasoningPart.providerMetadata,
      part.providerMetadata,
    );
  }
}

function findOrCreateReasoningPart(
  ctx: UpdateContext,
  part: TextStreamPartFor<"reasoning-start" | "reasoning-delta">,
) {
  const lastPart = ctx.message.parts.at(-1);
  if (lastPart?.type === "reasoning") {
    ctx.reasoningPartsById.set(part.id, lastPart);
    return lastPart;
  }
  const reasoningPart = {
    type: "reasoning",
    state: "streaming",
    text: "",
    providerMetadata: part.providerMetadata,
  } satisfies ReasoningUIPart;
  ctx.reasoningPartsById.set(part.id, reasoningPart);
  ctx.message.parts.push(reasoningPart);
  return reasoningPart;
}

function findReasoningPart(ctx: UpdateContext, id: string) {
  const tracked = ctx.reasoningPartsById.get(id);
  if (tracked) return tracked;
  return ctx.message.parts.find(
    (p): p is ReasoningUIPart =>
      p.type === "reasoning" && p.state === "streaming",
  );
}

function handleSource(ctx: UpdateContext, part: TextStreamPartFor<"source">) {
  if (part.sourceType === "url") {
    ctx.message.parts.push({
      type: "source-url",
      url: part.url,
      sourceId: part.id,
      providerMetadata: part.providerMetadata,
      title: part.title,
    });
  } else {
    ctx.message.parts.push({
      type: "source-document",
      mediaType: part.mediaType,
      sourceId: part.id,
      title: part.title,
      filename: part.filename,
      providerMetadata: part.providerMetadata,
    });
  }
}
