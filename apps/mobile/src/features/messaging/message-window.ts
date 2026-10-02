import type { Message as PdsMessage } from "@decentralized-convex/messages";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { pdsResult } from "./results";

type PageCursor =
  | { readonly after: number }
  | { readonly around: string }
  | { readonly before: number };

interface View {
  /** The message the window opened on, or undefined for the latest. */
  readonly anchor: string | undefined;
  /** Oldest page first. */
  readonly pages: readonly PageCursor[];
}

/**
 * Pages for the latest messages. The first page is frozen at the moment the
 * conversation opened, and a live tail page collects everything after it,
 * so new messages never shift the older pages.
 */
/**
 * When each conversation's latest window opened this app session. Reusing
 * it keeps query keys stable, so reopening a conversation shows cached
 * messages immediately instead of fetching from scratch.
 */
const openedAtByConversation = new Map<string, number>();
/** Past this, so many messages may have arrived that a fresh window is better. */
const REUSE_WINDOW_MS = 10 * 60 * 1000;

function latestWindow(conversationId: string, reopen = false) {
  const previous = openedAtByConversation.get(conversationId);
  const openedAt =
    !reopen && previous !== undefined && Date.now() - previous < REUSE_WINDOW_MS
      ? previous
      : Date.now();
  openedAtByConversation.set(conversationId, openedAt);
  return {
    anchor: undefined,
    pages: [{ before: openedAt + 1 }, { after: openedAt }],
  } satisfies View;
}

function anchoredWindow(messageId: string) {
  return {
    anchor: messageId,
    pages: [{ around: messageId }],
  } satisfies View;
}

/** Combines what every PDS returned for one page cursor. */
function mergeSources(
  sources: readonly {
    hasNewer: boolean;
    hasOlder: boolean;
    messages: PdsMessage[];
  }[],
) {
  return {
    hasNewer: sources.some((source) => source.hasNewer),
    hasOlder: sources.some((source) => source.hasOlder),
    messages: sources.flatMap((source) => source.messages),
  };
}

/** Every loaded message once, oldest first. */
function mergePages(pages: readonly { data?: { messages: PdsMessage[] } }[]) {
  const byId = new Map(
    pages
      .flatMap((page) => page.data?.messages ?? [])
      .map((message) => [message.messageId, message] as const),
  );
  return [...byId.values()].sort(
    (left, right) =>
      left.sentAt - right.sentAt ||
      left.messageId.localeCompare(right.messageId),
  );
}

/**
 * A scrollable window over a conversation, oldest first, that can open at
 * the latest message or around a specific one and grow in either direction.
 */
export function useMessageWindow(conversationId: string, anchor?: string) {
  const [view, setView] = useState<View>(() =>
    anchor === undefined
      ? latestWindow(conversationId)
      : anchoredWindow(anchor),
  );
  const pages = useQueries({
    queries: view.pages.map((cursor) =>
      pdsQuery({
        args: { conversationId, ...cursor },
        options: {
          select: (result) => {
            const sources = pdsResult(result);
            return sources === undefined ? undefined : mergeSources(sources);
          },
        },
        query: pds.messages.list,
      }),
    ),
  });

  const messages = mergePages(pages);
  const first = pages[0]?.data;
  const last = pages.at(-1)?.data;
  const hasOlder = first?.hasOlder ?? false;
  const hasNewer = last?.hasNewer ?? false;

  function loadOlder() {
    const oldest = messages[0];
    if (!hasOlder || oldest === undefined) return;
    if (
      view.pages.some(
        (page) => "before" in page && page.before === oldest.sentAt,
      )
    ) {
      return;
    }
    setView((current) => ({
      ...current,
      pages: [{ before: oldest.sentAt }, ...current.pages],
    }));
  }

  function loadNewer() {
    const newest = messages.at(-1);
    if (!hasNewer || newest === undefined) return;
    if (
      view.pages.some((page) => "after" in page && page.after === newest.sentAt)
    ) {
      return;
    }
    setView((current) => ({
      ...current,
      pages: [...current.pages, { after: newest.sentAt }],
    }));
  }

  return {
    anchor: view.anchor,
    /** Changes whenever the window reopens, so lists can remount. */
    viewKey: JSON.stringify(view.pages[0]),
    hasNewer,
    hasOlder,
    isLoading:
      pages.some((page) => page.data === undefined) && messages.length === 0,
    /** Drops the loaded pages and reopens at the latest message. */
    jumpToLatest: () => setView(latestWindow(conversationId, true)),
    loadNewer,
    loadOlder,
    messages,
  };
}
