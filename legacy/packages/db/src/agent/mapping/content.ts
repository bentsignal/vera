import type { ProviderOptions, ReasoningPart } from "@ai-sdk/provider-utils";
import type {
  AssistantContent,
  FilePart,
  ImagePart,
  ModelMessage,
  ProviderMetadata,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  UserContent,
} from "ai";

import type { Message } from "../validators";
import type { Content, SerializedContent } from "./types";
import { serializeDataOrUrl, toModelMessageDataOrUrl } from "./data";
import { normalizeToolResult } from "./tool_results";

interface PartMetadata {
  providerOptions?: ProviderOptions;
  providerMetadata?: ProviderMetadata;
}

interface MimeLike {
  mediaType?: string;
  mimeType?: string;
}

function getMimeOrMediaType(part: MimeLike) {
  return part.mediaType ?? part.mimeType;
}

function requireMediaType(part: MimeLike) {
  const mediaType = getMimeOrMediaType(part);
  if (!mediaType) throw new Error("Expected mediaType on file/image part");
  return mediaType;
}

function extractMetadata(part: object) {
  // eslint-disable-next-line no-restricted-syntax
  const metadata: PartMetadata = {};
  if ("providerOptions" in part && part.providerOptions) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    metadata.providerOptions = part.providerOptions as ProviderOptions;
  }
  if ("providerMetadata" in part && part.providerMetadata) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    metadata.providerMetadata = part.providerMetadata as ProviderMetadata;
  }
  return metadata;
}

interface LegacyToolCall {
  args?: unknown;
  input?: unknown;
}

function getToolCallInput(part: LegacyToolCall) {
  return part.input ?? part.args ?? {};
}

type SerializedPart = Exclude<SerializedContent, string>[number];
type ContentPart = Exclude<Content, string>[number];
type ModelPart =
  | UserContent[number]
  | Exclude<AssistantContent, string>[number]
  | Exclude<ModelMessage["content"], string>[number];

function asSerializedPart<T>(value: T) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return value as unknown as SerializedPart;
}

function serializePart(part: ContentPart) {
  const metadata = extractMetadata(part);
  switch (part.type) {
    case "text":
      return asSerializedPart({ type: "text", text: part.text, ...metadata });
    case "image":
      return asSerializedPart({
        type: "image",
        mediaType: getMimeOrMediaType(part),
        ...metadata,
        image: serializeDataOrUrl(part.image),
      });
    case "file":
      return asSerializedPart({
        type: "file",
        data: serializeDataOrUrl(part.data),
        filename: part.filename,
        mediaType: requireMediaType(part),
        ...metadata,
      });
    case "tool-call": {
      const input = getToolCallInput(part);
      return asSerializedPart({
        type: "tool-call",
        input,
        /** @deprecated Use `input` instead. */
        args: input,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        providerExecuted: part.providerExecuted,
        ...metadata,
      });
    }
    case "tool-result":
      return asSerializedPart(normalizeToolResult(part, metadata));
    case "reasoning":
      return asSerializedPart({
        type: "reasoning",
        text: part.text,
        ...metadata,
      });
    case "tool-approval-request":
      return asSerializedPart({
        type: "tool-approval-request",
        approvalId: part.approvalId,
        toolCallId: part.toolCallId,
        ...metadata,
      });
    case "tool-approval-response":
      return asSerializedPart({
        type: "tool-approval-response",
        approvalId: part.approvalId,
        approved: part.approved,
        reason: part.reason,
        providerExecuted: part.providerExecuted,
        ...metadata,
      });
    default:
      return null;
  }
}

export function serializeContent(content: Content | Message["content"]) {
  if (typeof content === "string") return { content };
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const parts = content as ContentPart[];
  const serialized = parts.map((p) => serializePart(p));
  const filtered = serialized.filter((p): p is SerializedPart => p !== null);
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return { content: filtered as SerializedContent };
}

export function fromModelMessageContent(content: Content) {
  if (typeof content === "string") return content;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const parts = content as ContentPart[];
  const mapped = parts
    .map((p) => serializePart(p))
    .filter((p): p is SerializedPart => p !== null);
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return mapped as Message["content"];
}

function buildRedactedReasoning(metadata: PartMetadata, redactedData: string) {
  if (!metadata.providerOptions) {
    return { type: "reasoning", text: "", ...metadata } satisfies ReasoningPart;
  }
  const providerOptions = Object.fromEntries(
    Object.entries(metadata.providerOptions).map(([key, value]) => [
      key,
      { ...value, redactedData },
    ]),
  );
  return {
    type: "reasoning",
    text: "",
    ...metadata,
    providerOptions,
  } satisfies ReasoningPart;
}

function asModelPart<T>(value: T) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return value as unknown as ModelPart;
}

function toModelImageOrFile(
  part: Extract<SerializedPart, { type: "image" | "file" }>,
) {
  if (part.type === "image") {
    return asModelPart({
      type: "image",
      image: toModelMessageDataOrUrl(part.image),
      mediaType: getMimeOrMediaType(part),
      ...extractMetadata(part),
    } satisfies ImagePart);
  }
  return asModelPart({
    type: "file",
    data: toModelMessageDataOrUrl(part.data),
    filename: part.filename,
    mediaType: requireMediaType(part),
    ...extractMetadata(part),
  } satisfies FilePart);
}

function toModelTextOrReasoning(
  part: Extract<SerializedPart, { type: "text" | "reasoning" }>,
) {
  const metadata = extractMetadata(part);
  if (part.type === "text") {
    return asModelPart({
      type: "text",
      text: part.text,
      ...metadata,
    } satisfies TextPart);
  }
  return asModelPart({
    type: "reasoning",
    text: part.text,
    ...metadata,
  } satisfies ReasoningPart);
}

function toModelToolCallPart(
  part: Extract<SerializedPart, { type: "tool-call" }>,
) {
  const input = getToolCallInput(part);
  return asModelPart({
    type: "tool-call",
    input,
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    providerExecuted: part.providerExecuted,
    ...extractMetadata(part),
  } satisfies ToolCallPart);
}

function toModelToolResultPart(
  part: Extract<SerializedPart, { type: "tool-result" }>,
) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const asToolResult = part as unknown as ToolResultPart;
  return normalizeToolResult(asToolResult, extractMetadata(part));
}

function toModelOtherPart(
  part: Extract<
    SerializedPart,
    {
      type:
        | "redacted-reasoning"
        | "source"
        | "tool-approval-request"
        | "tool-approval-response";
    }
  >,
) {
  if (part.type === "redacted-reasoning") {
    return asModelPart(
      buildRedactedReasoning(extractMetadata(part), part.data),
    );
  }
  return asModelPart({ ...part, ...extractMetadata(part) });
}

// eslint-disable-next-line no-restricted-syntax
const toModelHandlers: {
  [K in SerializedPart["type"]]: (
    part: Extract<SerializedPart, { type: K }>,
  ) => ModelPart | null;
} = {
  text: toModelTextOrReasoning,
  reasoning: toModelTextOrReasoning,
  image: toModelImageOrFile,
  file: toModelImageOrFile,
  "tool-call": toModelToolCallPart,
  "tool-result": toModelToolResultPart,
  "redacted-reasoning": toModelOtherPart,
  source: toModelOtherPart,
  "tool-approval-request": toModelOtherPart,
  "tool-approval-response": toModelOtherPart,
};

function toModelMessagePart(part: SerializedPart) {
  const handler = toModelHandlers[part.type];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/consistent-type-assertions
  return handler ? handler(part as never) : null;
}

export function toModelMessageContent(
  content: SerializedContent | ModelMessage["content"],
) {
  if (typeof content === "string") return content;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const parts = content as SerializedPart[];
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return parts.map(toModelMessagePart).filter((p) => p !== null) as Content;
}
