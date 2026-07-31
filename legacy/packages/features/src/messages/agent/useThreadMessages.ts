"use client";

import type { BetterOmit, ErrorMessage, Expand } from "convex-helpers";
import type { PaginatedQueryArgs, UsePaginatedQueryResult } from "convex/react";
import type {
  FunctionArgs,
  FunctionReference,
  PaginationOptions,
  PaginationResult,
} from "convex/server";
// eslint-disable-next-line no-restricted-imports -- useMemo needed to keep merged paginated/streaming results array stable across renders so consumers don't see new identities every tick
import { useEffect, useMemo, useRef, useState } from "react";
import { omit } from "convex-helpers";
import { usePaginatedQuery } from "convex-helpers/react";

import type {
  Message,
  MessageDoc,
  MessageStatus,
  StreamArgs,
} from "@acme/db/agent/validators";
import { sorted } from "@acme/db/agent/shared";
import { fromUIMessages } from "@acme/db/agent/ui";

import type {
  StreamQuery,
  StreamQueryArgs,
  SyncStreamsReturnValue,
} from "./types";
import { useStreamingUIMessages } from "./useStreamingUIMessages";

export interface MessageDocLike {
  order: number;
  stepOrder: number;
  status: MessageStatus | "streaming";
  message?: Message;
}

export type ThreadMessagesQuery<
  Args = unknown,
  M extends MessageDocLike = MessageDocLike,
> = FunctionReference<
  "query",
  "public",
  {
    threadId: string;
    paginationOpts: PaginationOptions;
    /**
     * If { stream: true } is passed, it will also query for stream deltas.
     * In order for this to work, the query must take as an argument streamArgs.
     */
    streamArgs?: StreamArgs;
  } & Args,
  PaginationResult<M> & { streams?: SyncStreamsReturnValue }
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ThreadMessagesQuery generics are biconditional helpers; constraining tighter would over-constrain consumers
export type ThreadMessagesArgs<Query extends ThreadMessagesQuery<any, any>> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- biconditional inference helper
  Query extends ThreadMessagesQuery<any, any>
    ? Expand<BetterOmit<FunctionArgs<Query>, "paginationOpts" | "streamArgs">>
    : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- biconditional inference helper
export type ThreadMessagesResult<Query extends ThreadMessagesQuery<any, any>> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- biconditional inference helper
  Query extends ThreadMessagesQuery<any, infer M> ? M : never;

type MergedMessage = MessageDocLike & { streaming: boolean; key: string };

function computeStartOrder(results: readonly MessageDocLike[]) {
  let startOrder = results.at(-1)?.order ?? 0;
  for (let i = results.length - 1; i >= 0; i--) {
    const m = results[i];
    // The "streaming" flag only exists on already-merged results; raw
    // paginated results never set it.
    if (m?.status === "pending") {
      // round down to the nearest 10 for some cache benefits
      startOrder = m.order - (m.order % 10);
      break;
    }
  }
  return startOrder;
}

function reduceMergedMessages(
  threadId: string | undefined,
  msgs: MergedMessage[],
) {
  // eslint-disable-next-line no-restricted-syntax -- reduce seed needs the element type on an empty array initializer
  const initial: MergedMessage[] = [];
  return msgs.reduce((acc, msg) => {
    msg.key = `${threadId ?? ""}-${msg.order}-${msg.stepOrder}`;
    const last = acc.at(-1);
    if (!last) return [msg];
    if (last.order !== msg.order || last.stepOrder !== msg.stepOrder) {
      return [...acc, msg];
    }
    if (
      last.status === "pending" &&
      (msg.streaming || msg.status !== "pending")
    ) {
      // Let's prefer a streaming or finalized message over a pending one.
      return [...acc.slice(0, -1), msg];
    }
    // skip the new one if the previous one (listed) was finalized
    return acc;
  }, initial);
}

/**
 * A hook that fetches messages from a thread.
 *
 * This hook is a wrapper around `usePaginatedQuery` and `useStreamingThreadMessages`.
 * It will fetch both full messages and streaming messages, and merge them together.
 *
 * The query must take as arguments `{ threadId, paginationOpts }` and return a
 * pagination result of objects that extend `MessageDoc`. To support streaming,
 * it must also take in `streamArgs: vStreamArgs` and return a `streams` object
 * returned from `agent.syncStreams`.
 */
export function useThreadMessages<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference relies on biconditional matching here; using `unknown, MessageDocLike` would over-constrain consumers whose docs are wider than MessageDocLike
  Query extends ThreadMessagesQuery<any, any>,
>(
  query: Query,
  args: ThreadMessagesArgs<Query> | "skip",
  options: {
    initialNumItems: number;
    stream?: Query extends StreamQuery
      ? boolean
      : ErrorMessage<"To enable streaming, your query must take in streamArgs: vStreamArgs and return a streams object returned from syncStreams. See docs.">;
  },
) {
  // These are full messages
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- usePaginatedQuery's argument type cannot be inferred from the constrained Query generic; widening at the boundary
  const paginatedArgs = args as PaginatedQueryArgs<Query> | "skip";
  const paginated = usePaginatedQuery(query, paginatedArgs, {
    initialNumItems: options.initialNumItems,
  });

  const startOrder = computeStartOrder(paginated.results);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- query is structurally compatible with StreamQuery here; the constraint cannot be expressed at the type level
  const streamQuery = query as unknown as StreamQuery<
    ThreadMessagesArgs<Query>
  >;
  const shouldSkipStreaming =
    !options.stream ||
    args === "skip" ||
    paginated.status === "LoadingFirstPage";
  // These are streaming messages that will not include full messages.
  /* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- ThreadMessagesArgs<Query>'s biconditional inference can't be narrowed to the stream-query's arg shape (which requires a paginationOpts intersection); runtime shape is identical */
  const streamingArgs = shouldSkipStreaming
    ? ("skip" as const)
    : ({
        ...args,
        paginationOpts: { cursor: null, numItems: 0 },
      } as any);
  const streamMessages = useStreamingThreadMessages(
    streamQuery,
    streamingArgs,
    {
      startOrder,
    },
  );
  /* eslint-enable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */

  const threadId =
    args === "skip"
      ? undefined
      : // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- args.threadId resolves to `any` through ThreadMessagesArgs<Query>'s conditional inference; at runtime it's always a string
        (args.threadId as string);

  const merged = useMemo(() => {
    const streamListMessages =
      streamMessages?.map((m) => ({
        ...m,
        streaming: m.status === "pending",
      })) ?? [];
    const concatenated = paginated.results
      .map((m) => ({ ...m, streaming: false }))
      // Note: this is intentionally after paginated results.
      .concat(streamListMessages);
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- concat unions paginated rows with derived stream rows; widening to the merged row shape so the reducer can mutate `key`
    const widened = concatenated as MergedMessage[];
    return {
      ...paginated,
      results: reduceMergedMessages(threadId, sorted(widened)),
    };
  }, [paginated, streamMessages, threadId]);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the merged shape adds `streaming` and `key` to each row; widening at the boundary so callers see the documented return type
  return merged as unknown as UsePaginatedQueryResult<
    ThreadMessagesResult<Query> & { streaming: boolean; key: string }
  >;
}

/**
 * @deprecated FYI `useStreamingUIMessages` is likely better for you.
 * A hook that fetches streaming messages from a thread.
 * This ONLY returns streaming messages. To get both, use `useThreadMessages`.
 */
export function useStreamingThreadMessages<Query extends StreamQuery<unknown>>(
  query: Query,
  args:
    | (StreamQueryArgs<Query> & {
        /** @deprecated Pass startOrder to the next argument (third argument). */
        startOrder?: number;
      })
    | "skip",
  options?: {
    startOrder?: number;
    skipStreamIds?: string[];
  },
) {
  const queryArgs =
    args === "skip"
      ? args
      : // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- omit() returns Omit<...>; we need to project the result back to the StreamQueryArgs<Query> shape
        (omit(args, ["startOrder"]) as unknown as StreamQueryArgs<Query>);
  const startOrder =
    args === "skip" ? undefined : (args.startOrder ?? undefined);
  const queryOptions = { startOrder, ...options };
  const uiMessages = useStreamingUIMessages(query, queryArgs, queryOptions);
  const [derivedMessages, setDerivedMessages] = useState<
    MessageDoc[] | undefined
  >();
  const generationRef = useRef(0);

  const argThreadId = args === "skip" ? undefined : args.threadId;
  const active = argThreadId !== undefined && uiMessages !== undefined;

  // eslint-disable-next-line no-restricted-syntax -- Effect needed to async-derive MessageDocs from streaming UIMessages via fromUIMessages()
  useEffect(() => {
    if (!active) return;
    generationRef.current += 1;
    const currentGeneration = generationRef.current;
    void (async () => {
      const nested = await Promise.all(
        uiMessages.map((m) => fromUIMessages([m], { threadId: argThreadId })),
      );
      if (generationRef.current === currentGeneration) {
        setDerivedMessages(nested.flat());
      }
    })();
  }, [active, uiMessages, argThreadId]);

  return active ? derivedMessages : undefined;
}
