import type { MessageDoc } from "../../../src/agent/validators";
import type { MutationCtx } from "../types";
import { listMessages, saveMessage } from "../messages";
import { agentUpdateMessage } from "./message_ops";

type ContentArrayPart = Extract<
  NonNullable<MessageDoc["message"]>["content"],
  unknown[]
>[number];

type ApprovalResponsePart = Extract<
  ContentArrayPart,
  { type: "tool-approval-response" }
>;

export async function agentApproveToolCall(
  agentName: string,
  ctx: MutationCtx,
  args: { threadId: string; approvalId: string; reason?: string },
) {
  return agentRespondToToolCallApproval(agentName, ctx, {
    ...args,
    approved: true,
  });
}

export async function agentDenyToolCall(
  agentName: string,
  ctx: MutationCtx,
  args: { threadId: string; approvalId: string; reason?: string },
) {
  return agentRespondToToolCallApproval(agentName, ctx, {
    ...args,
    approved: false,
  });
}

async function agentRespondToToolCallApproval(
  agentName: string,
  ctx: MutationCtx,
  args: {
    threadId: string;
    approvalId: string;
    approved: boolean;
    reason?: string;
  },
) {
  const { promptMessageId, existingResponseMessage } =
    await findApprovalContext(ctx, {
      threadId: args.threadId,
      approvalId: args.approvalId,
    });

  const newPart = {
    type: "tool-approval-response",
    approvalId: args.approvalId,
    approved: args.approved,
    reason: args.reason,
  } satisfies ApprovalResponsePart;

  // Merge into an existing approval-response message for this step
  // so the AI SDK sees a single tool message per step.
  if (existingResponseMessage) {
    const existingContent = existingResponseMessage.message?.content;
    const existingResponses = Array.isArray(existingContent)
      ? existingContent.filter(
          (p): p is ApprovalResponsePart => p.type === "tool-approval-response",
        )
      : [];
    const mergedContent = [...existingResponses, newPart];
    await agentUpdateMessage(ctx, {
      messageId: existingResponseMessage._id,
      patch: {
        message: { role: "tool", content: mergedContent },
        status: "success",
      },
    });
    return { messageId: existingResponseMessage._id };
  }

  const { messageId } = await saveMessage(ctx, {
    threadId: args.threadId,
    promptMessageId,
    agentName,
    message: {
      role: "tool",
      content: [newPart],
    },
  });
  return { messageId };
}

async function findApprovalContext(
  ctx: MutationCtx,
  args: { threadId: string; approvalId: string },
) {
  // NOTE: This pagination returns messages in descending order (newest first).
  // The "already handled" check (tool-approval-response) relies on seeing
  // responses before their corresponding requests.
  let existingResponseMessage: MessageDoc | undefined;
  // Limit the search to the most recent messages. Approvals should always
  // be near the end of the thread.
  const page = await listMessages(ctx, {
    threadId: args.threadId,
    paginationOpts: { cursor: null, numItems: 100 },
  });
  for (const message of page.page) {
    const content = message.message?.content;
    if (!Array.isArray(content)) continue;

    // Check if this assistant message starts a different approval step.
    // If so, any response message we've seen so far belongs to a newer
    // step — reset it so we don't merge across step boundaries.
    // Only reset if the target approval is NOT in this message (i.e.,
    // this is a genuinely different step, not the same step with
    // multiple tool calls).
    if (
      message.message?.role === "assistant" &&
      content.some(
        (p) =>
          p.type === "tool-approval-request" &&
          p.approvalId !== args.approvalId,
      ) &&
      !content.some(
        (p) =>
          p.type === "tool-approval-request" &&
          p.approvalId === args.approvalId,
      )
    ) {
      existingResponseMessage = undefined;
    }

    const result = scanContentForApproval(
      content,
      message,
      args.approvalId,
      existingResponseMessage,
    );
    if (result.kind === "match") {
      return {
        promptMessageId: result.promptMessageId,
        existingResponseMessage: result.existingResponseMessage,
      };
    }
    existingResponseMessage = result.existingResponseMessage;
  }

  throw new Error(
    `Approval request ${args.approvalId} was not found in the last 100 messages of thread ${args.threadId}`,
  );
}

function scanContentForApproval(
  content: ContentArrayPart[],
  message: MessageDoc,
  approvalId: string,
  existingResponseMessage: MessageDoc | undefined,
) {
  let tracked = existingResponseMessage;
  for (const part of content) {
    if (
      part.type === "tool-approval-response" &&
      part.approvalId === approvalId
    ) {
      throw new Error(`Approval ${approvalId} was already handled`);
    }
    if (part.type === "tool-approval-response" && !tracked) {
      tracked = message;
    }
    if (
      part.type === "tool-approval-request" &&
      part.approvalId === approvalId
    ) {
      return {
        kind: "match",
        promptMessageId: message._id,
        existingResponseMessage: tracked,
      };
    }
  }
  return { kind: "none", existingResponseMessage: tracked };
}
