import type { ModelMessage } from "ai";

interface ApprovalRequest {
  toolCallId: string;
  messageIndex: number;
}

interface UnresolvedApproval extends ApprovalRequest {
  approvalId: string;
}

interface ContentPart {
  type: string;
  approvalId?: string;
  toolCallId?: string;
}

function isApprovalRequest(part: ContentPart) {
  return (
    part.type === "tool-approval-request" &&
    !!part.approvalId &&
    !!part.toolCallId
  );
}

function isApprovalResponse(part: ContentPart) {
  return part.type === "tool-approval-response" && !!part.approvalId;
}

function collectApprovalParts(messages: ModelMessage[]) {
  const requests = new Map<string, ApprovalRequest>();
  const resolvedIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!msg || !Array.isArray(msg.content)) continue;
    for (const rawPart of msg.content) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const part = rawPart as ContentPart;
      if (isApprovalRequest(part) && part.approvalId && part.toolCallId) {
        requests.set(part.approvalId, {
          toolCallId: part.toolCallId,
          messageIndex: i,
        });
      } else if (isApprovalResponse(part) && part.approvalId) {
        resolvedIds.add(part.approvalId);
      }
    }
  }
  return { requests, resolvedIds };
}

function collectApprovals(messages: ModelMessage[]) {
  const { requests, resolvedIds } = collectApprovalParts(messages);
  const unresolved = [];
  for (const [approvalId, info] of requests) {
    if (!resolvedIds.has(approvalId)) {
      unresolved.push({ approvalId, ...info });
    }
  }
  return unresolved;
}

function groupByMessageIndex(unresolved: UnresolvedApproval[]) {
  const grouped = new Map<
    number,
    { approvalId: string; toolCallId: string }[]
  >();
  for (const entry of unresolved) {
    console.warn(
      `Auto-denying unresolved tool approval ${entry.approvalId} ` +
        `(toolCallId: ${entry.toolCallId}): new generation started`,
    );
    let group = grouped.get(entry.messageIndex);
    if (!group) {
      group = [];
      grouped.set(entry.messageIndex, group);
    }
    group.push({ approvalId: entry.approvalId, toolCallId: entry.toolCallId });
  }
  return grouped;
}

/**
 * Scan messages for unresolved `tool-approval-request` parts and inject
 * synthetic `tool-approval-response` denials so the AI SDK receives a
 * complete history (every tool-call has a corresponding result or denial).
 *
 * Handles the case where a user sends a new message instead of resolving
 * pending approvals — old approvals are auto-denied rather than silently
 * dropped.
 */
export function autoDenyUnresolvedApprovals(messages: ModelMessage[]) {
  const unresolved = collectApprovals(messages);
  if (unresolved.length === 0) return messages;

  const byMessageIndex = groupByMessageIndex(unresolved);

  // eslint-disable-next-line no-restricted-syntax
  const result: ModelMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!msg) continue;
    result.push(msg);
    const group = byMessageIndex.get(i);
    if (group) {
      result.push({
        role: "tool",
        content: group.map((entry) => ({
          type: "tool-approval-response" as const,
          approvalId: entry.approvalId,
          approved: false,
          reason: "auto-denied: new generation started",
        })),
      });
    }
  }

  return result;
}
