import type { TextStreamPart, ToolSet } from "ai";

import type { UIMessage } from "../ui/types";
import type { StreamDelta, StreamMessage } from "../validators";
import { joinText } from "../shared";
import { getParts, statusFromStreamStatus } from "./helpers";
import { applyPart, buildContext, finalizeReasoning } from "./part_handlers";

export type TextStreamPartFor<TYPE extends string> = Extract<
  TextStreamPart<ToolSet>,
  { type: TYPE }
>;

// exported for testing
export function updateFromTextStreamParts(
  threadId: string,
  streamMessage: StreamMessage,
  existing:
    | { streamId: string; cursor: number; message: UIMessage }
    | undefined,
  deltas: StreamDelta[],
) {
  const { cursor, parts } = getParts<TextStreamPart<ToolSet>>(
    deltas,
    existing?.cursor,
  );
  const newStatus = statusFromStreamStatus(streamMessage.status);
  const changed =
    parts.length > 0 ||
    (existing !== undefined && newStatus !== existing.message.status);
  const existingMessage =
    existing?.message ?? blankAssistantMessage(streamMessage, threadId);
  if (!changed) {
    return [
      existing ?? {
        streamId: streamMessage.streamId,
        cursor,
        message: existingMessage,
      },
      false,
    ] as const;
  }

  const message = structuredClone(existingMessage);
  message.status = newStatus;
  const ctx = buildContext(message);

  for (const part of parts) {
    applyPart(ctx, part);
  }

  finalizeReasoning(message);
  message.text = joinText(message.parts);
  return [
    {
      streamId: streamMessage.streamId,
      cursor,
      message,
    },
    true,
  ] as const;
}

function blankAssistantMessage(streamMessage: StreamMessage, threadId: string) {
  return {
    id: `stream:${streamMessage.streamId}`,
    key: `${threadId}-${streamMessage.order}-${streamMessage.stepOrder}`,
    order: streamMessage.order,
    stepOrder: streamMessage.stepOrder,
    status: statusFromStreamStatus(streamMessage.status),
    agentName: streamMessage.agentName,
    text: "",
    _creationTime: Date.now(),
    role: "assistant" as const,
    parts: [],
  } satisfies UIMessage;
}
