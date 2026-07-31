"use client";

import type { UIDataTypes, UIMessageChunk, UITools } from "ai";
// eslint-disable-next-line no-restricted-imports -- useMemo needed: the returned message array is used as a useEffect dep upstream and needs stable identity when nothing changed
import { useEffect, useMemo, useState } from "react";

import type { UIMessage } from "@acme/db/agent/ui";
import type { StreamDelta, StreamMessage } from "@acme/db/agent/validators";
import {
  blankUIMessage,
  deriveUIMessagesFromTextStreamParts,
  getParts,
  updateFromUIMessageChunks,
} from "@acme/db/agent/deltas";

import type { StreamQuery, StreamQueryArgs } from "./types";
import { useDeltaStreams } from "./useDeltaStreams";

interface MessageStateEntry<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
> {
  uiMessage: UIMessage<METADATA, DATA_PARTS, TOOLS>;
  cursor: number;
}

type MessageState<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
> = Record<string, MessageStateEntry<METADATA, DATA_PARTS, TOOLS>>;

function hasNewDeltas<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  streams: { streamMessage: StreamMessage; deltas: StreamDelta[] }[],
  messageState: MessageState<METADATA, DATA_PARTS, TOOLS>,
) {
  for (const stream of streams) {
    const lastDelta = stream.deltas.at(-1);
    const cursor = messageState[stream.streamMessage.streamId]?.cursor;
    if (cursor === undefined) {
      return true;
    }
    if (lastDelta && lastDelta.start >= cursor) {
      return true;
    }
  }
  return false;
}

// eslint-disable-next-line no-restricted-syntax -- the AI SDK helpers return `any`; pinning the return type here keeps the generic propagation intact at the call site
async function buildEntryForStream<
  METADATA,
  DATA_PARTS extends UIDataTypes,
  TOOLS extends UITools,
>(
  threadId: string,
  streamMessage: StreamMessage,
  deltas: StreamDelta[],
): Promise<{
  streamId: string;
  uiMessage: UIMessage<METADATA, DATA_PARTS, TOOLS>;
  cursor: number;
}> {
  const { parts, cursor } = getParts<UIMessageChunk>(deltas, 0);
  if (streamMessage.format === "UIMessageChunk") {
    // Unfortunately this can't handle resuming from a UIMessage and adding
    // more chunks, so we re-create it from scratch each time.
    const baseMessage = blankUIMessage<METADATA>(streamMessage, threadId);
    const updated = await updateFromUIMessageChunks(baseMessage, parts);
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- updateFromUIMessageChunks erases the per-call generics; we widen back to the caller-provided UIMessage shape
    const uiMessage = updated as UIMessage<METADATA, DATA_PARTS, TOOLS>;
    return { streamId: streamMessage.streamId, uiMessage, cursor };
  }
  const [uiMessages] = deriveUIMessagesFromTextStreamParts(
    threadId,
    [streamMessage],
    [],
    deltas,
  );
  const first = uiMessages[0];
  if (!first) {
    throw new Error(
      `deriveUIMessagesFromTextStreamParts returned no message for stream ${streamMessage.streamId}`,
    );
  }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- deriveUIMessagesFromTextStreamParts erases the per-call generics; we widen back to the caller-provided UIMessage shape
  const uiMessage = first as UIMessage<METADATA, DATA_PARTS, TOOLS>;
  return { streamId: streamMessage.streamId, uiMessage, cursor };
}

/**
 * A hook that fetches streaming messages from a thread and converts them to UIMessages
 * using AI SDK's readUIMessageStream.
 * This ONLY returns streaming UIMessages. To get both full and streaming messages,
 * use `useUIMessages`.
 */
export function useStreamingUIMessages<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
  Query extends StreamQuery<unknown> = StreamQuery<object>,
>(
  query: Query,
  args: StreamQueryArgs<Query> | "skip",
  options?: {
    startOrder?: number;
    skipStreamIds?: string[];
  },
) {
  const [messageState, setMessageState] = useState<
    MessageState<METADATA, DATA_PARTS, TOOLS>
  >({});

  const streams = useDeltaStreams(query, args, options);

  const threadId = args === "skip" ? undefined : args.threadId;

  // eslint-disable-next-line no-restricted-syntax -- Effect needed to async-derive UIMessages from delta streams (await getParts/updateFromUIMessageChunks)
  useEffect(() => {
    if (!streams || threadId === undefined) return;
    if (!hasNewDeltas(streams, messageState)) return;
    const abortController = new AbortController();
    void (async () => {
      const entries = await Promise.all(
        streams.map(({ deltas, streamMessage }) =>
          buildEntryForStream<METADATA, DATA_PARTS, TOOLS>(
            threadId,
            streamMessage,
            deltas,
          ),
        ),
      );
      if (abortController.signal.aborted) return;
      // eslint-disable-next-line no-restricted-syntax -- empty record initializer needs the generic shape on the declaration
      const next: MessageState<METADATA, DATA_PARTS, TOOLS> = {};
      for (const { streamId, uiMessage, cursor } of entries) {
        next[streamId] = { uiMessage, cursor };
      }
      setMessageState(next);
    })();
    return () => {
      abortController.abort();
    };
  }, [messageState, streams, threadId]);

  return useMemo(() => {
    if (!streams) return undefined;
    return streams
      .map(
        ({ streamMessage }) => messageState[streamMessage.streamId]?.uiMessage,
      )
      .filter((uiMessage) => uiMessage !== undefined);
  }, [messageState, streams]);
}
