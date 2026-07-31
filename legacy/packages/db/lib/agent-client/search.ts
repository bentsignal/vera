import type { ModelMessage } from "ai";
import { assert } from "convex-helpers";

import type { Message, MessageDoc } from "../../src/agent/validators";
import type {
  ActionCtx,
  Config,
  ContextOptions,
  MutationCtx,
  Options,
  QueryCtx,
} from "./types";
import { internal } from "../../src/_generated/api";
import {
  autoDenyUnresolvedApprovals,
  docsToModelMessages,
  toModelMessage,
} from "../../src/agent/mapping";
import { DEFAULT_RECENT_MESSAGES, sorted } from "../../src/agent/shared";
import { asId } from "./_ids";

/**
 * Fetch the most recent N successful messages from a thread.
 */
export async function fetchContextMessages(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  args: {
    userId: string | undefined;
    threadId: string | undefined;
    targetMessageId?: string;
    /** @deprecated use targetMessageId */
    upToAndIncludingMessageId?: string;
    contextOptions: ContextOptions;
  },
) {
  const { recentMessages } = await fetchRecentMessages(ctx, args);
  return recentMessages;
}

async function fetchRecentMessages(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  args: {
    userId: string | undefined;
    threadId: string | undefined;
    targetMessageId?: string;
    upToAndIncludingMessageId?: string;
    contextOptions: ContextOptions;
  },
) {
  assert(args.userId ?? args.threadId, "Specify userId or threadId");
  const opts = args.contextOptions;
  // eslint-disable-next-line no-restricted-syntax -- empty array initializer has no element type; annotation lets later push targets typecheck
  let recentMessages: MessageDoc[] = [];
  const targetMessageId =
    args.targetMessageId ?? args.upToAndIncludingMessageId;
  if (args.threadId && opts.recentMessages !== 0) {
    const { page } = await ctx.runQuery(
      internal.agent.messages.listMessagesByThreadId,
      {
        threadId: asId<"threads">(args.threadId),
        excludeToolMessages: opts.excludeToolMessages,
        paginationOpts: {
          numItems: opts.recentMessages ?? DEFAULT_RECENT_MESSAGES,
          cursor: null,
        },
        upToAndIncludingMessageId: targetMessageId
          ? asId<"messages">(targetMessageId)
          : undefined,
        order: "desc",
        statuses: ["success"],
      },
    );
    recentMessages = filterOutOrphanedToolMessages(sorted(page));
  }
  return { recentMessages };
}

type ToolPartIndex = ReturnType<typeof indexToolParts>;

function indexToolParts(docs: MessageDoc[]) {
  const idx = {
    toolCallIds: new Set<string>(),
    toolResultIds: new Set<string>(),
    approvalRequestsByToolCallId: new Map<string, string>(),
    approvalResponseIds: new Set<string>(),
  };
  for (const doc of docs) {
    if (!doc.message || !Array.isArray(doc.message.content)) continue;
    for (const content of doc.message.content) {
      indexContentPart(content, idx);
    }
  }
  return idx;
}

function indexContentPart(
  content: { type: string } & Record<string, unknown>,
  idx: ToolPartIndex,
) {
  if (content.type === "tool-call" && typeof content.toolCallId === "string") {
    idx.toolCallIds.add(content.toolCallId);
  } else if (
    content.type === "tool-result" &&
    typeof content.toolCallId === "string"
  ) {
    idx.toolResultIds.add(content.toolCallId);
  } else if (
    content.type === "tool-approval-request" &&
    typeof content.toolCallId === "string" &&
    typeof content.approvalId === "string"
  ) {
    idx.approvalRequestsByToolCallId.set(
      content.toolCallId,
      content.approvalId,
    );
  } else if (
    content.type === "tool-approval-response" &&
    typeof content.approvalId === "string"
  ) {
    idx.approvalResponseIds.add(content.approvalId);
  }
}

function makeToolCallChecks(idx: ToolPartIndex) {
  function hasApprovalResponse(toolCallId: string) {
    const approvalId = idx.approvalRequestsByToolCallId.get(toolCallId);
    return approvalId !== undefined && idx.approvalResponseIds.has(approvalId);
  }
  function hasApprovalRequest(toolCallId: string) {
    return idx.approvalRequestsByToolCallId.has(toolCallId);
  }
  return { hasApprovalResponse, hasApprovalRequest };
}

/**
 * Filter out tool messages that don't have both a tool call and response.
 * For the approval workflow, tool calls with approval responses (but no
 * tool-results yet) should also be kept.
 */
export function filterOutOrphanedToolMessages(docs: MessageDoc[]) {
  const idx = indexToolParts(docs);
  const checks = makeToolCallChecks(idx);
  return docs.flatMap((doc) => {
    const filtered = filterDocContent(doc, idx, checks);
    return filtered ? [filtered] : [];
  });
}

function filterDocContent(
  doc: MessageDoc,
  idx: ToolPartIndex,
  checks: ReturnType<typeof makeToolCallChecks>,
) {
  if (doc.message?.role === "assistant" && Array.isArray(doc.message.content)) {
    const content = doc.message.content.filter(
      (p) =>
        p.type !== "tool-call" ||
        idx.toolResultIds.has(p.toolCallId) ||
        checks.hasApprovalResponse(p.toolCallId) ||
        checks.hasApprovalRequest(p.toolCallId),
    );
    if (!content.length) return undefined;
    return { ...doc, message: { ...doc.message, content } };
  }
  if (doc.message?.role === "tool") {
    const content = doc.message.content.filter((c) => {
      if (c.type === "tool-result") {
        return idx.toolCallIds.has(c.toolCallId);
      }
      return true;
    });
    if (!content.length) return undefined;
    return { ...doc, message: { ...doc.message, content } };
  }
  return doc;
}

function splitAroundPromptMessage(
  recentMessages: MessageDoc[],
  promptMessageId: string | undefined,
) {
  if (!promptMessageId) {
    return {
      prePromptDocs: recentMessages,
      existingResponseDocs: [],
      promptMessage: undefined,
    };
  }
  const idx = recentMessages.findIndex((m) => m._id === promptMessageId);
  if (idx === -1) {
    return {
      prePromptDocs: recentMessages,
      existingResponseDocs: [],
      promptMessage: undefined,
    };
  }
  return {
    prePromptDocs: recentMessages.slice(0, idx),
    existingResponseDocs: recentMessages.slice(idx + 1),
    promptMessage: recentMessages[idx],
  };
}

/**
 * Build the LLM prompt: system instructions + recent thread history +
 * input messages + the prompt itself + any existing responses to the
 * prompt message.
 */
export async function fetchContextWithPrompt(
  ctx: ActionCtx,
  args: {
    prompt: string | (ModelMessage | Message)[] | undefined;
    messages: (ModelMessage | Message)[] | undefined;
    promptMessageId: string | undefined;
    userId: string | undefined;
    threadId: string | undefined;
    agentName?: string;
  } & Options &
    Config,
) {
  const { threadId, userId } = args;
  const promptArray = getPromptArray(args.prompt);

  const { recentMessages } = await fetchRecentMessages(ctx, {
    userId,
    threadId,
    targetMessageId: args.promptMessageId,
    contextOptions: args.contextOptions ?? {},
  });

  const { prePromptDocs, existingResponseDocs, promptMessage } =
    splitAroundPromptMessage(recentMessages, args.promptMessageId);

  if (promptMessage && promptArray.length === 0 && promptMessage.message) {
    promptArray.push(promptMessage.message);
  }

  const messages = args.messages ?? [];
  const recent = docsToModelMessages(prePromptDocs);
  const inputMessages = messages.map(toModelMessage);
  const inputPrompt = promptArray.map(toModelMessage);
  const existingResponses = docsToModelMessages(existingResponseDocs);

  const allMessages = [
    ...recent,
    ...inputMessages,
    ...inputPrompt,
    ...existingResponses,
  ];
  const processed = args.contextHandler
    ? await args.contextHandler(ctx, {
        allMessages,
        search: [],
        recent,
        inputMessages,
        inputPrompt,
        existingResponses,
        userId,
        threadId,
      })
    : allMessages;

  return {
    messages: autoDenyUnresolvedApprovals(processed),
    order: promptMessage?.order,
    stepOrder: promptMessage?.stepOrder,
  };
}

// eslint-disable-next-line no-restricted-syntax -- explicit return type widens the literal so callers can push other ModelMessage variants
export function getPromptArray(
  prompt: string | (ModelMessage | Message)[] | undefined,
): (ModelMessage | Message)[] {
  if (!prompt) return [];
  if (Array.isArray(prompt)) return prompt;
  return [{ role: "user", content: prompt }];
}
