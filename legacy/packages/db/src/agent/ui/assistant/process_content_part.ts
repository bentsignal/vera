import type { ReasoningUIPart, TextUIPart, UIDataTypes, UITools } from "ai";

import type { Message } from "../../validators";
import type { MessageDocWithExtras, UIMessage } from "../types";
import type { PartCommon } from "./tool_part_helpers";
import { toUIFilePart } from "../../mapping";
import { toSourcePart } from "../sources";
import {
  handleApprovalRequest,
  handleApprovalResponse,
} from "./handle_approval";
import { handleToolCall } from "./handle_tool_call";
import { handleToolResult } from "./handle_tool_result";

// The full union of content-part types across all message roles. We iterate
// raw `Message["content"]` which, unnarrowed, can yield any of these.
type AnyContentPart = Exclude<Message["content"], string>[number];

interface ProcessContext<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
> {
  allParts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"];
  partCommon: PartCommon;
  message: MessageDocWithExtras<METADATA>;
}

export function processAssistantContentPart<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  contentPart: AnyContentPart,
  ctx: ProcessContext<METADATA, DATA_PARTS, TOOLS>,
) {
  if (pushLeafPart(contentPart, ctx)) return;
  routeToolPart(contentPart, ctx);
}

/**
 * Handles non-tool leaf parts (text, reasoning, file/image, source, etc.).
 * Returns true if the part was handled.
 */
const LEAF_TYPES = new Set([
  "text",
  "reasoning",
  "file",
  "image",
  "source",
  "redacted-reasoning",
]);

function pushLeafPart<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  contentPart: AnyContentPart,
  ctx: ProcessContext<METADATA, DATA_PARTS, TOOLS>,
) {
  if (!LEAF_TYPES.has(contentPart.type)) return false;
  pushLeafPartImpl(contentPart, ctx);
  return true;
}

function pushLeafPartImpl<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  contentPart: AnyContentPart,
  ctx: ProcessContext<METADATA, DATA_PARTS, TOOLS>,
) {
  if (contentPart.type === "text") {
    ctx.allParts.push({
      ...ctx.partCommon,
      ...contentPart,
    } satisfies TextUIPart);
    return;
  }
  if (contentPart.type === "reasoning") {
    ctx.allParts.push({
      ...ctx.partCommon,
      ...contentPart,
    } satisfies ReasoningUIPart);
    return;
  }
  if (contentPart.type === "file" || contentPart.type === "image") {
    pushFilePart(ctx.allParts, contentPart);
    return;
  }
  if (contentPart.type === "source") {
    ctx.allParts.push(toSourcePart(contentPart));
  }
  // "redacted-reasoning" intentionally not rendered.
}

function pushFilePart<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  allParts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"],
  // The validator allows optional mediaType; AI SDK's FilePart requires it.
  // toUIFilePart throws at runtime if missing.
  contentPart: { type: "file" | "image"; mediaType?: string } & object,
) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- validator-typed file/image parts have an optional mediaType; toUIFilePart enforces it at runtime
  const part = contentPart as Parameters<typeof toUIFilePart>[0];
  allParts.push(toUIFilePart(part));
}

type ToolContentPart = Extract<
  AnyContentPart,
  {
    type:
      | "tool-call"
      | "tool-result"
      | "tool-approval-request"
      | "tool-approval-response";
  }
>;

function isToolContentPart(part: AnyContentPart): part is ToolContentPart {
  return (
    part.type === "tool-call" ||
    part.type === "tool-result" ||
    part.type === "tool-approval-request" ||
    part.type === "tool-approval-response"
  );
}

function routeToolPart<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  contentPart: AnyContentPart,
  ctx: ProcessContext<METADATA, DATA_PARTS, TOOLS>,
) {
  if (!isToolContentPart(contentPart)) {
    console.warn("Unknown content part type for assistant", contentPart);
    return;
  }
  switch (contentPart.type) {
    case "tool-call":
      handleToolCall(contentPart, ctx);
      return;
    case "tool-result":
      handleToolResult(contentPart, ctx);
      return;
    case "tool-approval-request":
      handleApprovalRequest(contentPart, ctx);
      return;
    case "tool-approval-response":
      handleApprovalResponse(contentPart, ctx);
  }
}
