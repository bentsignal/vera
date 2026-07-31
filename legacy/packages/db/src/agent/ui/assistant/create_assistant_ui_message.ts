import type { ToolUIPart, UIDataTypes, UITools } from "ai";

import type { MessageDocWithExtras, UIMessage } from "../types";
import type { ApprovalPart, ExecutionDeniedInfo } from "./approvals";
import { toModelMessage } from "../../mapping";
import { joinText, sorted } from "../../shared";
import { extractTextFromMessageDoc, toSourcePart } from "../sources";
import { extractApprovalsAndDenials } from "./approvals";
import { processAssistantContentPart } from "./process_content_part";
import {
  findToolPartByApprovalId,
  findToolPartByCallId,
  getApproval,
  getPartCommon,
  makeReasoningPart,
  makeTextPart,
  patchToolPart,
} from "./tool_part_helpers";

/**
 * Helper so callers can create a fresh, correctly-typed `parts` array without
 * relying on a variable type annotation (banned by lint).
 */
function partsArray<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(parts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"]) {
  return parts;
}

/**
 * Build a single assistant `UIMessage` from a group of related `MessageDoc`s
 * (assistant message + its tool calls/results across steps).
 */
export function createAssistantUIMessage<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
>(groupUnordered: MessageDocWithExtras<METADATA>[]) {
  if (groupUnordered.length === 0) {
    throw new Error("createAssistantUIMessage requires a non-empty group");
  }
  const group = sorted(groupUnordered);
  const firstMessage = group[0];
  const lastMessage = group[group.length - 1];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- features package enables noUncheckedIndexedAccess and widens these to undefined there; the check is a load-bearing narrow on that side
  if (!firstMessage || !lastMessage) {
    throw new Error("createAssistantUIMessage requires a non-empty group");
  }

  const { approvalParts, executionDeniedResults } =
    extractApprovalsAndDenials(group);

  const allParts = partsArray<METADATA, DATA_PARTS, TOOLS>([]);
  for (const message of group) {
    appendPartsFromMessage<METADATA, DATA_PARTS, TOOLS>(allParts, message);
  }

  applyApprovalParts(allParts, approvalParts);
  applyExecutionDenied(allParts, executionDeniedResults);

  const status = lastMessage.streaming ? "streaming" : lastMessage.status;
  const notices = group.flatMap((m) => m.notices ?? []);
  const errors = group.flatMap((m) => m.errors ?? []);
  return {
    id: firstMessage._id,
    _creationTime: firstMessage._creationTime,
    order: firstMessage.order,
    stepOrder: firstMessage.stepOrder,
    key: `${firstMessage.threadId}-${firstMessage.order}-${firstMessage.stepOrder}`,
    agentName: firstMessage.agentName,
    userId: firstMessage.userId,
    role: "assistant" as const,
    text: joinText(allParts),
    status,
    parts: allParts,
    metadata: group.find((m) => m.metadata)?.metadata,
    notices: notices.length > 0 ? notices : undefined,
    errors: errors.length > 0 ? errors : undefined,
  } satisfies UIMessage<METADATA, DATA_PARTS, TOOLS>;
}

function appendPartsFromMessage<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  allParts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"],
  message: MessageDocWithExtras<METADATA>,
) {
  if (!message.message) return;
  const coreMessage = toModelMessage(message.message);
  const content = coreMessage.content;
  const nonStringContent = typeof content === "string" ? [] : content;
  const partCommon = getPartCommon(message);

  pushReasoningAndTextFallbacks<METADATA, DATA_PARTS, TOOLS>(
    allParts,
    message,
    nonStringContent,
    partCommon,
  );

  // Iterate the raw (validator-typed) content so discriminated-union narrowing
  // is available in processAssistantContentPart — `toModelMessage` converts to
  // the SDK's `ModelMessage` which hides some of our part variants.
  const rawContent = message.message.content;
  if (Array.isArray(rawContent)) {
    for (const contentPart of rawContent) {
      processAssistantContentPart<METADATA, DATA_PARTS, TOOLS>(contentPart, {
        allParts,
        partCommon,
        message,
      });
    }
  }

  for (const source of message.sources ?? []) {
    allParts.push(toSourcePart(source));
  }
}

function pushReasoningAndTextFallbacks<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  allParts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"],
  message: MessageDocWithExtras<METADATA>,
  nonStringContent: { type: string }[],
  partCommon: ReturnType<typeof getPartCommon>,
) {
  const hasStructuredReasoning = nonStringContent.some(
    (c) => c.type === "reasoning",
  );
  if (message.reasoning && !hasStructuredReasoning) {
    allParts.push(makeReasoningPart(message.reasoning, partCommon));
  }
  const text = extractTextFromMessageDoc(message);
  if (text && nonStringContent.length === 0) {
    allParts.push(makeTextPart(text, partCommon));
  }
}

const FINAL_STATES = new Set([
  "output-available",
  "output-error",
  "output-denied",
]);

function applyApprovalParts<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  allParts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"],
  approvalParts: ApprovalPart[],
) {
  for (const approvalPart of approvalParts) {
    if (approvalPart.type === "tool-approval-request") {
      applyApprovalRequestPart(allParts, approvalPart);
    } else {
      applyApprovalResponsePart(allParts, approvalPart);
    }
  }
}

function applyApprovalRequestPart<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  allParts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"],
  approvalPart: Extract<ApprovalPart, { type: "tool-approval-request" }>,
) {
  const toolCallPart = findToolPartByCallId(allParts, approvalPart.toolCallId);
  if (!toolCallPart) return;
  // Always set approval info (needed for response matching), but only
  // update state if not in a final state.
  const update = buildUpdate({
    approval: { id: approvalPart.approvalId },
    state: FINAL_STATES.has(readState(toolCallPart))
      ? undefined
      : "approval-requested",
  });
  patchToolPart(toolCallPart, update);
}

function applyApprovalResponsePart<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  allParts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"],
  approvalPart: Extract<ApprovalPart, { type: "tool-approval-response" }>,
) {
  const toolCallPart = findToolPartByApprovalId(
    allParts,
    approvalPart.approvalId,
  );
  if (!toolCallPart) return;
  const update = buildUpdate({
    approval: {
      id: approvalPart.approvalId,
      approved: approvalPart.approved,
      reason: approvalPart.reason,
    },
    state: FINAL_STATES.has(readState(toolCallPart))
      ? undefined
      : approvalPart.approved
        ? "approval-responded"
        : "output-denied",
  });
  patchToolPart(toolCallPart, update);
}

function buildUpdate(input: {
  approval: Record<string, unknown>;
  state: string | undefined;
}) {
  return input.state !== undefined
    ? { approval: input.approval, state: input.state }
    : { approval: input.approval };
}

function applyExecutionDenied<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  allParts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"],
  executionDeniedResults: ExecutionDeniedInfo[],
) {
  for (const denied of executionDeniedResults) {
    const toolCallPart = findToolPartByCallId(allParts, denied.toolCallId);
    if (!toolCallPart) continue;
    const existing = getApproval(toolCallPart);
    patchToolPart(toolCallPart, {
      state: "output-denied",
      approval: existing
        ? { ...existing, approved: false, reason: denied.reason }
        : { id: "", approved: false, reason: denied.reason },
    });
  }
}

function readState(part: ToolUIPart | { state?: string }) {
  if ("state" in part && typeof part.state === "string") return part.state;
  return "";
}
