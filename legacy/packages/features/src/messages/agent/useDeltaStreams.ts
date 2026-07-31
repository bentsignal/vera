"use client";

import type { FunctionArgs } from "convex/server";
import { useRef, useState } from "react";
import { assert } from "convex-helpers";
// eslint-disable-next-line no-restricted-imports -- this hook drives delta streaming over convex's reactive subscription with a generic Query passed by the caller; convexQuery + tanstack useQuery can't express the dynamic FunctionArgs<Query>/"skip" sentinel pattern this hook needs
import { useQuery } from "convex/react";

import type {
  StreamArgs,
  StreamDelta,
  StreamMessage,
} from "@acme/db/agent/validators";
import { sorted } from "@acme/db/agent/shared";

import type {
  StreamQuery,
  StreamQueryArgs,
  SyncStreamsReturnValue,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- StreamQuery generic is biconditional; narrowing to `unknown` breaks convex overload resolution through FunctionArgs<Query>
type AnyStreamQuery = StreamQuery<any>;

interface DeltaStream {
  streamMessage: StreamMessage;
  deltas: StreamDelta[];
}

interface DeltaStreamState {
  startOrder: number;
  threadId: string | undefined;
  deltaStreams: DeltaStream[] | undefined;
}

interface UseDeltaStreamsOptions {
  startOrder?: number;
  skipStreamIds?: string[];
}

type StreamListResult =
  | { streams: Extract<SyncStreamsReturnValue, { kind: "list" }> }
  | undefined;
type StreamDeltasResult =
  | { streams: Extract<SyncStreamsReturnValue, { kind: "deltas" }> }
  | undefined;

function buildListArgs<Query extends AnyStreamQuery>(
  args: StreamQueryArgs<Query> | "skip",
  startOrder: number,
) {
  if (args === "skip") return "skip" as const;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- StreamArgs is a discriminated union; convex's FunctionArgs<Query> can only be satisfied by widening here at the boundary
  const streamArgs = { kind: "list", startOrder } as StreamArgs;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- StreamArgs is a discriminated union; convex's FunctionArgs<Query> can only be satisfied by widening here at the boundary
  return { ...args, streamArgs } as FunctionArgs<Query>;
}

function buildDeltasArgs<Query extends AnyStreamQuery>(
  args: StreamQueryArgs<Query> | "skip",
  streamMessages: StreamMessage[] | undefined,
  cursors: Record<string, number>,
) {
  if (args === "skip" || !streamMessages?.length) return "skip" as const;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- StreamArgs is a discriminated union; convex's FunctionArgs<Query> can only be satisfied by widening here at the boundary
  const streamArgs = {
    kind: "deltas",
    cursors: streamMessages.map(({ streamId }) => ({
      streamId,
      cursor: cursors[streamId] ?? 0,
    })),
  } as StreamArgs;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- StreamArgs is a discriminated union; convex's FunctionArgs<Query> can only be satisfied by widening here at the boundary
  return { ...args, streamArgs } as FunctionArgs<Query>;
}

function selectStreamMessages(
  streamList: StreamListResult,
  options: UseDeltaStreamsOptions | undefined,
) {
  if (!streamList) return undefined;
  return sorted(
    streamList.streams.messages.filter(
      ({ streamId, order }) =>
        !options?.skipStreamIds?.includes(streamId) &&
        (!options?.startOrder || order >= options.startOrder),
    ),
  );
}

function groupNewDeltasByStreamId(
  newDeltas: StreamDelta[],
  cursors: Record<string, number>,
) {
  const grouped = new Map<string, StreamDelta[]>();
  for (const delta of newDeltas) {
    const oldCursor = cursors[delta.streamId];
    if (oldCursor && delta.start < oldCursor) continue;
    const existing = grouped.get(delta.streamId);
    if (existing) {
      const lastDelta = existing.at(-1);
      const previousEnd = lastDelta?.end;
      assert(
        previousEnd === delta.start,
        `Gap found in deltas for ${delta.streamId} jumping to ${delta.start} from ${String(previousEnd)}`,
      );
      existing.push(delta);
    } else {
      assert(
        !oldCursor || oldCursor === delta.start,
        `Gap found - first delta after ${String(oldCursor)} is ${delta.start} for stream ${delta.streamId}`,
      );
      grouped.set(delta.streamId, [delta]);
    }
  }
  return grouped;
}

function computeNextCursors(
  streamMessages: StreamMessage[],
  newDeltasByStreamId: Map<string, StreamDelta[]>,
  cursors: Record<string, number>,
) {
  // eslint-disable-next-line no-restricted-syntax -- empty Record initializer needs an explicit type
  const newCursors: Record<string, number> = {};
  for (const { streamId } of streamMessages) {
    const cursor =
      newDeltasByStreamId.get(streamId)?.at(-1)?.end ?? cursors[streamId];
    if (cursor !== undefined) {
      newCursors[streamId] = cursor;
    }
  }
  return newCursors;
}

function mergeDeltaStreams(
  streamMessages: StreamMessage[],
  previous: DeltaStream[] | undefined,
  newDeltasByStreamId: Map<string, StreamDelta[]>,
) {
  return streamMessages.map<DeltaStream>((streamMessage) => {
    const { streamId } = streamMessage;
    const old = previous?.find((ds) => ds.streamMessage.streamId === streamId);
    const newDeltas = newDeltasByStreamId.get(streamId);
    if (!newDeltas && streamMessage === old?.streamMessage) {
      return old;
    }
    return {
      streamMessage,
      deltas: [...(old?.deltas ?? []), ...(newDeltas ?? [])],
    };
  });
}

function getCacheFriendlyStartOrder(
  options: UseDeltaStreamsOptions | undefined,
  current: number,
) {
  if (!options?.startOrder || options.startOrder >= current) return current;
  return options.startOrder - (options.startOrder % 10);
}

// eslint-disable-next-line no-restricted-syntax -- object literal with `deltaStreams: undefined` needs the return type pin so the field stays widened to DeltaStream[] | undefined
function makeInitialState<Query extends AnyStreamQuery>(
  args: StreamQueryArgs<Query> | "skip",
  options: UseDeltaStreamsOptions | undefined,
): DeltaStreamState {
  return {
    startOrder: options?.startOrder ?? 0,
    deltaStreams: undefined,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- args.threadId resolves to `any` through StreamQueryArgs<StreamQuery<any>>; at runtime it's always a string
    threadId: args === "skip" ? undefined : args.threadId,
  };
}

function advanceStartOrder(
  state: DeltaStreamState,
  options: UseDeltaStreamsOptions | undefined,
) {
  if (!state.deltaStreams?.length) return;
  state.startOrder = getCacheFriendlyStartOrder(options, state.startOrder);
}

function deriveStreamMessages({
  args,
  streamList,
  state,
  options,
}: {
  args: unknown;
  streamList: StreamListResult;
  state: DeltaStreamState;
  options: UseDeltaStreamsOptions | undefined;
}) {
  if (args === "skip") return undefined;
  const fromList = selectStreamMessages(streamList, options);
  if (fromList) return fromList;
  return state.deltaStreams?.map(({ streamMessage }) => streamMessage);
}

function applyNewDeltas({
  state,
  streamMessages,
  newDeltas,
  cursors,
  setCursors,
}: {
  state: DeltaStreamState;
  streamMessages: StreamMessage[];
  newDeltas: StreamDelta[];
  cursors: Record<string, number>;
  setCursors: (next: Record<string, number>) => void;
}) {
  if (!newDeltas.length) return;
  const newDeltasByStreamId = groupNewDeltasByStreamId(newDeltas, cursors);
  setCursors(computeNextCursors(streamMessages, newDeltasByStreamId, cursors));
  state.deltaStreams = mergeDeltaStreams(
    streamMessages,
    state.deltaStreams,
    newDeltasByStreamId,
  );
}

function resetStateIfThreadChanged<Query extends AnyStreamQuery>(
  state: DeltaStreamState,
  args: StreamQueryArgs<Query> | "skip",
  options: UseDeltaStreamsOptions | undefined,
  resetCursors: () => void,
) {
  if (args === "skip" || state.threadId === args.threadId) return;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- args.threadId resolves to `any` through StreamQueryArgs<StreamQuery<any>>; at runtime it's always a string
  state.threadId = args.threadId;
  state.deltaStreams = undefined;
  state.startOrder = options?.startOrder ?? 0;
  resetCursors();
}

export function useDeltaStreams<Query extends AnyStreamQuery>(
  query: Query,
  args: StreamQueryArgs<Query> | "skip",
  options?: UseDeltaStreamsOptions,
) {
  const stateRef = useRef<DeltaStreamState | null>(null);
  stateRef.current ??= makeInitialState(args, options);
  const state = stateRef.current;
  const [cursors, setCursors] = useState<Record<string, number>>({});

  resetStateIfThreadChanged(state, args, options, () => setCursors({}));
  advanceStartOrder(state, options);

  // Get all the active streams
  const streamListRaw =
    // eslint-disable-next-line no-restricted-syntax -- convex/react useQuery does not support a select option; subscription is intentional
    useQuery(
      query,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- buildListArgs returns "skip" | FunctionArgs<Query>; convex's overload can't collapse the union through a single call
      buildListArgs(args, state.startOrder) as FunctionArgs<Query>,
    );
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- StreamArgs.kind narrows the response to the "list" variant; the type system can't track this through useQuery
  const streamList = streamListRaw as StreamListResult;

  const streamMessages = deriveStreamMessages({
    args,
    streamList,
    state,
    options,
  });

  // When no active streams remain, clear the stale state so we stop
  // returning old streaming UIMessages.
  if (streamMessages?.length === 0) {
    state.deltaStreams = undefined;
  }

  // Get the deltas for all the active streams, if any.
  const cursorQueryRaw =
    // eslint-disable-next-line no-restricted-syntax -- convex/react useQuery does not support a select option; subscription is intentional
    useQuery(
      query,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- buildDeltasArgs returns "skip" | FunctionArgs<Query>; convex's overload can't collapse the union through a single call
      buildDeltasArgs(args, streamMessages, cursors) as FunctionArgs<Query>,
    );
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- StreamArgs.kind narrows the response to the "deltas" variant; the type system can't track this through useQuery
  const cursorQuery = cursorQueryRaw as StreamDeltasResult;

  if (streamMessages) {
    applyNewDeltas({
      state,
      streamMessages,
      newDeltas: cursorQuery?.streams.deltas ?? [],
      cursors,
      setCursors,
    });
  }
  return state.deltaStreams;
}
