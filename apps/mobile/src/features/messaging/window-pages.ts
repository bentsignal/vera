import type { Message as PdsMessage } from "@decentralized-convex/messages";
import type { QueryClient } from "@tanstack/react-query";
import { pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import type { PageCursor, PageData } from "./window-model";
import { cachedSelected, pdsResult } from "./results";

// The queries for a window's pages (see `useMessageWindow`).

/** What a window pages through: a conversation, or one thread in it. */
export interface WindowSource {
  readonly conversationId: string;
  /** The thread's original message, for a thread's replies. */
  readonly threadId?: string;
}

export type Page = PageData<PdsMessage> & { root?: PdsMessage | null };

/**
 * Combines what every PDS returned for one page cursor. A thread's page
 * also has its original, from whichever PDS stores it.
 */
function mergeSources(
  sources: readonly {
    hasNewer: boolean;
    hasOlder: boolean;
    messages: PdsMessage[];
    root?: PdsMessage | null;
  }[],
) {
  return {
    hasNewer: sources.some((source) => source.hasNewer),
    hasOlder: sources.some((source) => source.hasOlder),
    messages: sources.flatMap((source) => source.messages),
    root: sources.find((source) => source.root != null)?.root ?? null,
  } satisfies Page;
}

export function listPageQuery(
  session: string,
  conversationId: string,
  cursor: PageCursor,
) {
  return pdsQuery({
    args: { conversationId, ...cursor },
    options: {
      select: (result) => {
        const sources = pdsResult(result);
        return sources === undefined ? undefined : mergeSources(sources);
      },
    },
    query: pds.messages.list,
    session,
  });
}

export function threadPageQuery(
  session: string,
  { conversationId, threadId }: Required<WindowSource>,
  cursor: PageCursor,
) {
  return pdsQuery({
    // A thread always opens at its latest replies.
    args: { conversationId, threadId, ...("around" in cursor ? {} : cursor) },
    options: {
      select: (result) => {
        const sources = pdsResult(result);
        return sources === undefined ? undefined : mergeSources(sources);
      },
    },
    query: pds.messages.thread,
    session,
  });
}

export function pageQuery(
  session: string,
  source: WindowSource,
  cursor: PageCursor,
) {
  const { conversationId, threadId } = source;
  return threadId === undefined
    ? listPageQuery(session, conversationId, cursor)
    : threadPageQuery(session, { conversationId, threadId }, cursor);
}

/** What's cached of a page. */
export function cachedPage(
  queryClient: QueryClient,
  session: string,
  { conversationId, threadId }: WindowSource,
  cursor: PageCursor,
) {
  return threadId === undefined
    ? cachedSelected(
        queryClient,
        listPageQuery(session, conversationId, cursor),
      )
    : cachedSelected(
        queryClient,
        threadPageQuery(session, { conversationId, threadId }, cursor),
      );
}
