import type { UIMessageChunk } from "ai";
import { readUIMessageStream } from "ai";
import { assert } from "convex-helpers";

import type { UIMessage } from "../ui/types";
import type { StreamDelta, StreamMessage } from "../validators";
import { joinText, sorted } from "../shared";
import { getParts, statusFromStreamStatus } from "./helpers";
import { updateFromTextStreamParts } from "./update_text_stream";

export { getParts, statusFromStreamStatus };

export function blankUIMessage<METADATA = unknown>(
  streamMessage: StreamMessage & { metadata?: METADATA },
  threadId: string,
) {
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
    ...(streamMessage.metadata ? { metadata: streamMessage.metadata } : {}),
  } satisfies UIMessage<METADATA>;
}

export async function updateFromUIMessageChunks(
  uiMessage: UIMessage,
  parts: UIMessageChunk[],
) {
  const partsStream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
  // Use an object so TS doesn't narrow these flags to their initial values —
  // they're mutated inside the onError callback which runs later.
  const state = { failed: false, suppressError: false };
  const messageStream = readUIMessageStream({
    message: uiMessage,
    stream: partsStream,
    onError: (e) => {
      const errorMessage = e instanceof Error ? e.message : String(e);
      // Tool invocation errors can be safely ignored when streaming continuation
      // after tool approval - the stored messages have the complete tool context
      if (errorMessage.toLowerCase().includes("no tool invocation found")) {
        // Silently suppress - this is expected after tool approval when the
        // continuation stream has tool-result without the original tool-call
        state.suppressError = true;
        return;
      }
      state.failed = true;
      console.error("Error in stream", e);
    },
    terminateOnError: true,
  });
  let message = uiMessage;
  try {
    for await (const messagePart of messageStream) {
      assert(
        messagePart.id === message.id,
        `Expecting to only make one UIMessage in a stream`,
      );
      message = messagePart;
    }
  } catch (e) {
    // If we've already handled this error in onError and marked it as suppressed,
    // don't rethrow - the stored messages provide the fallback
    if (!state.suppressError) {
      throw e;
    }
  }
  if (state.failed) {
    message.status = "failed";
  }
  message.text = joinText(message.parts);
  return message;
}

export async function deriveUIMessagesFromDeltas(
  threadId: string,
  streamMessages: StreamMessage[],
  allDeltas: StreamDelta[],
) {
  // eslint-disable-next-line no-restricted-syntax -- empty array initializer has no runtime type; the explicit UIMessage[] annotation lets TS check subsequent .push() calls.
  const messages: UIMessage[] = [];
  for (const streamMessage of streamMessages) {
    if (streamMessage.format === "UIMessageChunk") {
      const { parts } = getParts<UIMessageChunk>(
        allDeltas.filter((d) => d.streamId === streamMessage.streamId),
        0,
      );
      const uiMessage = await updateFromUIMessageChunks(
        blankUIMessage(streamMessage, threadId),
        parts,
      );
      messages.push(uiMessage);
    } else {
      const [uiMessages] = deriveUIMessagesFromTextStreamParts(
        threadId,
        [streamMessage],
        [],
        allDeltas,
      );
      messages.push(...uiMessages);
    }
  }
  return sorted(messages);
}

export function deriveUIMessagesFromTextStreamParts(
  threadId: string,
  streamMessages: StreamMessage[],
  existingStreams: {
    streamId: string;
    cursor: number;
    message: UIMessage;
  }[],
  allDeltas: StreamDelta[],
) {
  // eslint-disable-next-line no-restricted-syntax -- empty array initializer has no runtime type; the explicit annotation lets TS check subsequent .push() calls.
  const newStreams: {
    streamId: string;
    cursor: number;
    message: UIMessage;
  }[] = [];
  let changed = false;
  for (const streamMessage of streamMessages) {
    const deltas = allDeltas.filter(
      (d) => d.streamId === streamMessage.streamId,
    );
    const existing = existingStreams.find(
      (s) => s.streamId === streamMessage.streamId,
    );
    const [newStream, messageChanged] = updateFromTextStreamParts(
      threadId,
      streamMessage,
      existing,
      deltas,
    );
    newStreams.push(newStream);
    if (messageChanged) changed = true;
  }
  for (const { streamId } of existingStreams) {
    if (!newStreams.find((s) => s.streamId === streamId)) {
      // There's a stream that's no longer active.
      changed = true;
    }
  }
  const messages = sorted(newStreams.map((s) => s.message));
  return [messages, newStreams, changed] as const;
}
