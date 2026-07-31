import type { ToolUIPart, UIDataTypes, UITools } from "ai";

import type { MessageDocWithExtras, UIMessage } from "../types";
import { findToolPartByCallId, patchToolPart } from "./tool_part_helpers";

interface HandleContext<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
> {
  allParts: UIMessage<METADATA, DATA_PARTS, TOOLS>["parts"];
  message: MessageDocWithExtras<METADATA>;
}

export function handleApprovalRequest<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  contentPart: {
    type: "tool-approval-request";
    approvalId: string;
    toolCallId: string;
  },
  ctx: HandleContext<METADATA, DATA_PARTS, TOOLS>,
) {
  const toolCallPart = findToolPartByCallId(
    ctx.allParts,
    contentPart.toolCallId,
  );
  if (!toolCallPart) {
    console.warn(
      "Tool approval request without preceding tool call",
      contentPart,
    );
    return;
  }
  patchToolPart(toolCallPart, {
    state: "approval-requested",
    approval: { id: contentPart.approvalId },
  });
}

export function handleApprovalResponse<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  contentPart: {
    type: "tool-approval-response";
    approvalId: string;
    approved: boolean;
    reason?: string;
  },
  ctx: HandleContext<METADATA, DATA_PARTS, TOOLS>,
) {
  // Matched by approval.id rather than toolCallId since the response is in a
  // tool-role message separated from the original call.
  const toolCallPart = ctx.allParts.find((part) => {
    if (!("approval" in part)) return false;
    const approval = part.approval;
    if (approval === undefined) return false;
    if (typeof approval !== "object") return false;
    return "id" in approval && approval.id === contentPart.approvalId;
  });
  if (!toolCallPart) {
    console.warn(
      "Tool approval response without matching approval request",
      contentPart,
    );
    return;
  }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed via `approval` field which only lives on tool parts
  const asToolPart = toolCallPart as ToolUIPart;
  patchToolPart(asToolPart, {
    state: contentPart.approved ? "approval-responded" : "output-denied",
    approval: {
      id: contentPart.approvalId,
      approved: contentPart.approved,
      reason: contentPart.reason,
    },
  });
}
