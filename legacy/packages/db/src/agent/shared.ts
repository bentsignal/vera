import type {
  FilePart,
  ImagePart,
  ReasoningPart,
  ToolApprovalRequest,
  ToolCallPart,
  ToolResultPart,
} from "@ai-sdk/provider-utils";
import type {
  ModelMessage,
  TextPart,
  UIDataTypes,
  UIMessagePart,
  UITools,
} from "ai";

import type { Message, MessageContentParts } from "./validators";

export const DEFAULT_RECENT_MESSAGES = 100;

export function isTool(message: Message | ModelMessage) {
  return (
    message.role === "tool" ||
    (message.role === "assistant" &&
      Array.isArray(message.content) &&
      message.content.some((c) => c.type === "tool-call"))
  );
}

export function extractText(message: Message | ModelMessage) {
  switch (message.role) {
    case "user":
      if (typeof message.content === "string") return message.content;
      return joinText(message.content);
    case "assistant":
      if (typeof message.content === "string") return message.content;
      return joinText(message.content) || undefined;
    case "system":
      return message.content;
    case "tool":
      return undefined;
  }
}

export function joinText(
  parts: (
    | UIMessagePart<UIDataTypes, UITools>
    | TextPart
    | ImagePart
    | FilePart
    | ReasoningPart
    | ToolCallPart
    | ToolResultPart
    | MessageContentParts
    | ToolApprovalRequest
  )[],
) {
  return parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .filter(Boolean)
    .join(" ");
}

export function extractReasoning(message: Message | ModelMessage) {
  if (typeof message.content === "string") {
    return undefined;
  }
  return message.content
    .filter((c) => c.type === "reasoning")
    .map((c) => c.text)
    .join(" ");
}

export const DEFAULT_MESSAGE_RANGE = { before: 2, after: 1 };

export function sorted<T extends { order: number; stepOrder: number }>(
  messages: T[],
  order: "asc" | "desc" = "asc",
) {
  return [...messages].sort(
    order === "asc"
      ? (a, b) => a.order - b.order || a.stepOrder - b.stepOrder
      : (a, b) => b.order - a.order || b.stepOrder - a.stepOrder,
  );
}

export type ModelOrMetadata =
  | string
  | ({ provider: string } & ({ modelId: string } | { model: string }));

export function getModelName(model: ModelOrMetadata) {
  if (typeof model === "string") {
    if (model.includes("/")) {
      return model.split("/").slice(1).join("/");
    }
    return model;
  }
  return "modelId" in model ? model.modelId : model.model;
}

export function getProviderName(model: ModelOrMetadata) {
  if (typeof model === "string") {
    const provider = model.split("/").at(0);
    if (!provider) throw new Error(`Invalid model identifier: ${model}`);
    return provider;
  }
  return model.provider;
}
