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
import { useMemo } from "react";
import { usePaginatedQuery } from "convex-helpers/react";

import type { UIMessage, UIStatus } from "@acme/db/agent/ui";
import type { StreamArgs } from "@acme/db/agent/validators";
import { sorted } from "@acme/db/agent/shared";
import { combineUIMessages } from "@acme/db/agent/ui";

import type { StreamQuery, SyncStreamsReturnValue } from "./types";
import { useStreamingUIMessages } from "./useStreamingUIMessages";

export interface UIMessageLike {
  order: number;
  stepOrder: number;
  status: UIStatus;
  parts: UIMessage["parts"];
  role: UIMessage["role"];
}

export type UIMessagesQuery<
  Args = unknown,
  M extends UIMessageLike = UIMessageLike,
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

export type UIMessagesQueryArgs<
  Query extends UIMessagesQuery<unknown, UIMessageLike>,
> =
  Query extends UIMessagesQuery<unknown, UIMessageLike>
    ? Expand<BetterOmit<FunctionArgs<Query>, "paginationOpts" | "streamArgs">>
    : never;

export type UIMessagesQueryResult<
  Query extends UIMessagesQuery<unknown, UIMessageLike>,
> = Query extends UIMessagesQuery<unknown, infer M> ? M : never;

/**
 * A hook that fetches UIMessages from a thread.
 *
 * It's similar to useThreadMessages, for endpoints that return UIMessages.
 * The streaming messages are materialized as UIMessages. The rest are passed
 * through from the query.
 *
 * The query must take as arguments `{ threadId, paginationOpts }` and return a
 * pagination result of objects similar to UIMessage. To support streaming, it
 * must also take in `streamArgs: vStreamArgs` and return a `streams` object
 * returned from `syncStreams`.
 */
export function useUIMessages<
  Query extends UIMessagesQuery<unknown, UIMessageLike>,
>(
  query: Query,
  args: UIMessagesQueryArgs<Query> | "skip",
  options: {
    initialNumItems: number;
    stream?: Query extends StreamQuery
      ? boolean
      : ErrorMessage<"To enable streaming, your query must take in streamArgs: vStreamArgs and return a streams object returned from syncStreams. See docs.">;
    skipStreamIds?: string[];
  },
) {
  // These are full messages
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- usePaginatedQuery's argument type cannot be inferred from the constrained Query generic; widening at the boundary
  const paginatedArgs = args as PaginatedQueryArgs<Query> | "skip";
  const paginated = usePaginatedQuery(query, paginatedArgs, {
    initialNumItems: options.initialNumItems,
  });

  const startOrder = paginated.results.length
    ? Math.min(...paginated.results.map((m) => m.order))
    : 0;
  // These are streaming messages that will not include full messages.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- query is structurally compatible with StreamQuery here; the constraint cannot be expressed at the type level
  const streamQuery = query as unknown as StreamQuery<
    UIMessagesQueryArgs<Query>
  >;
  const shouldSkipStreaming =
    !options.stream ||
    args === "skip" ||
    paginated.status === "LoadingFirstPage";
  /* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- UIMessagesQueryArgs<Query>'s biconditional inference can't be narrowed to the stream-query's arg shape (which requires a paginationOpts intersection); runtime shape is identical */
  const streamingArgs = shouldSkipStreaming
    ? ("skip" as const)
    : ({
        ...args,
        paginationOpts: { cursor: null, numItems: 0 },
      } as any);
  const streamMessages = useStreamingUIMessages(streamQuery, streamingArgs, {
    startOrder,
    skipStreamIds: options.skipStreamIds,
  });
  /* eslint-enable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */

  const merged = useMemo(() => {
    // Messages may have been split by pagination. Re-combine them here.
    const combined = combineUIMessages(
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- paginated.results is PaginatedQueryItem<Query>[] which structurally matches UIMessage; the constraint cannot be expressed at the type level
      sorted(paginated.results) as UIMessage[],
    );
    return {
      ...paginated,
      results: dedupeMessages(combined, streamMessages ?? []),
    };
  }, [paginated, streamMessages]);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- merged is typed as { ...paginated, results: combinedM[] }; the caller-facing UsePaginatedQueryResult shape needs widening here at the boundary
  return merged as unknown as UsePaginatedQueryResult<
    UIMessagesQueryResult<Query>
  >;
}

export function dedupeMessages<
  M extends {
    order: number;
    stepOrder: number;
    status: UIStatus;
  },
>(messages: M[], streamMessages: M[]) {
  // eslint-disable-next-line no-restricted-syntax -- reduce seed needs the element type on an empty array initializer
  const initial: M[] = [];
  return sorted(messages.concat(streamMessages)).reduce((msgs, msg) => {
    const last = msgs.at(-1);
    if (!last) {
      return [msg];
    }
    if (last.order !== msg.order || last.stepOrder !== msg.stepOrder) {
      return [...msgs, msg];
    }
    if (
      (last.status === "pending" || last.status === "streaming") &&
      msg.status !== "pending"
    ) {
      // Let's prefer a streaming or finalized message over a pending
      // one.
      return [...msgs.slice(0, -1), msg];
    }
    // skip the new one if the previous one (listed) was finalized
    return msgs;
  }, initial);
}
