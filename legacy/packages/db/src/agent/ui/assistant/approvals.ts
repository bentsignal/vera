import type { MessageDocWithExtras } from "../types";

export interface ApprovalRequestPart {
  type: "tool-approval-request";
  approvalId: string;
  toolCallId: string;
}

export interface ApprovalResponsePart {
  type: "tool-approval-response";
  approvalId: string;
  approved: boolean;
  reason?: string;
}

export type ApprovalPart = ApprovalRequestPart | ApprovalResponsePart;

export interface ExecutionDeniedInfo {
  toolCallId: string;
  reason?: string;
}

/**
 * Extract approval parts and execution-denied tool results from raw message
 * content for UI rendering. Execution-denied results are stored here because
 * they are converted to text format for provider compatibility in start.ts,
 * losing their original type information.
 */
function emptyList<T>(list: T[]) {
  return list;
}

export function extractApprovalsAndDenials<METADATA>(
  group: MessageDocWithExtras<METADATA>[],
) {
  const approvalParts = emptyList<ApprovalPart>([]);
  const executionDeniedResults = emptyList<ExecutionDeniedInfo>([]);

  for (const message of group) {
    const rawContent = message.message?.content;
    if (!Array.isArray(rawContent)) continue;
    for (const part of rawContent) {
      if (part.type === "tool-approval-request") {
        approvalParts.push({
          type: "tool-approval-request",
          approvalId: part.approvalId,
          toolCallId: part.toolCallId,
        });
      } else if (part.type === "tool-approval-response") {
        approvalParts.push({
          type: "tool-approval-response",
          approvalId: part.approvalId,
          approved: part.approved,
          reason: part.reason,
        });
      } else if (
        part.type === "tool-result" &&
        part.output?.type === "execution-denied"
      ) {
        executionDeniedResults.push({
          toolCallId: part.toolCallId,
          reason: part.output.reason,
        });
      }
    }
  }

  return { approvalParts, executionDeniedResults };
}
