import type { QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";

import type { PageCursor, PageData, View } from "./window-model";
import type { Page, WindowSource } from "./window-pages";
import { isLive } from "./stay-live";
import {
  anchoredView,
  follow,
  latestView,
  mergePages,
  pageAfter,
  pageKey,
  reusable,
  windowParts,
  withPage,
} from "./window-model";
import { cachedPage, listPageQuery, pageQuery } from "./window-pages";

// The pages a screen shows of a conversation or a thread, and how they
// follow new messages: see window-model.ts.

export type { WindowSource } from "./window-pages";

/** The window each conversation last showed this app session, and when. */
const lastWindows = new Map<string, { view: View; at: number }>();
/**
 * Past this, so many messages may have arrived that a fresh window is
 * better. A window still live (see `stayLive`) is current anyway; one that
 * isn't shows what it last had while the PDS catches it up, and opens again
 * at the latest if it turns out to be more than a page behind.
 */
const REUSE_WINDOW_MS = 10 * 60 * 1000;

function windowKeyOf(session: string, source: WindowSource) {
  return [session, source.conversationId, source.threadId ?? ""].join(" ");
}

/** The view a window over the latest messages opens with, remembered. */
function openLatest(
  queryClient: QueryClient,
  session: string,
  source: WindowSource,
  now = Date.now(),
) {
  const windowKey = windowKeyOf(session, source);
  const last = lastWindows.get(windowKey);
  const lastCursor = last?.view.pages.at(-1);
  const lastPage =
    lastCursor === undefined
      ? undefined
      : cachedPage(queryClient, session, source, lastCursor);
  if (
    last !== undefined &&
    reusable(last.view, lastPage, {
      age: now - last.at,
      maxAge: REUSE_WINDOW_MS,
    })
  ) {
    // Followed again only once the PDS confirms its pages (`advance`).
    return isLive(queryClient, session, source.conversationId)
      ? last.view
      : { ...last.view, followed: [] };
  }
  const view = latestView(now);
  lastWindows.set(windowKey, { at: now, view });
  return view;
}

/**
 * Remembers the window a screen shows, to open with it again, and when it
 * opened at the latest messages.
 */
function remember(windowKey: string, view: View) {
  const last = lastWindows.get(windowKey);
  if (last?.view === view || view.anchor !== undefined) return;
  const same = last !== undefined && last.view.liveSince === view.liveSince;
  lastWindows.set(windowKey, { at: same ? last.at : Date.now(), view });
}

/**
 * Starts loading the pages a conversation opens with at its latest
 * message, ahead of the window that will show them.
 */
export function prefetchLatestMessages(
  queryClient: QueryClient,
  session: string,
  conversationId: string,
) {
  const source = { conversationId };
  for (const cursor of openLatest(queryClient, session, source).pages) {
    void queryClient.prefetchQuery(
      listPageQuery(session, conversationId, cursor),
    );
  }
}

/**
 * Fetches a conversation's latest messages again, as a window opened at
 * them now would show them (with what they show, which comes along), even
 * if they're cached: a copy saved on the device is behind.
 */
export function refetchLatestMessages(
  queryClient: QueryClient,
  session: string,
  conversationId: string,
) {
  const source = { conversationId };
  return Promise.all(
    openLatest(queryClient, session, source).pages.map((cursor) =>
      queryClient.fetchQuery({
        ...listPageQuery(session, conversationId, cursor),
        staleTime: 0,
      }),
    ),
  );
}

/**
 * When the conversation's latest window opened this app session, if it
 * has: its pages are the latest messages a screen has shown.
 */
export function latestOpenedAt(session: string, conversationId: string) {
  return lastWindows.get(windowKeyOf(session, { conversationId }))?.view
    .liveSince;
}

/** The pages of the conversation's latest window opened at `openedAt`. */
export function latestPageQueries(
  session: string,
  conversationId: string,
  openedAt: number,
) {
  return latestView(openedAt).pages.map((cursor) =>
    listPageQuery(session, conversationId, cursor),
  );
}

/** The queries the pages of a window opened at `openedAt` show with. */
export function latestPageParts(openedAt: number, pages: readonly PageData[]) {
  return windowParts(latestView(openedAt), pages);
}

/** The window's pages, as the list and its reactions and threads use them. */
function pagesOf(view: View, results: readonly { data?: Page }[], offset = 0) {
  const initial = new Set(view.initial);
  return view.pages.map((cursor, index) => ({
    initial: initial.has(cursor),
    key: pageKey(cursor),
    data: results[offset + index]?.data,
  }));
}

type WindowState = ReturnType<typeof follow>;
type SetWindowState = (update: (current: WindowState) => WindowState) => void;

/**
 * The window's view and the one it's opening instead, following new
 * messages as they arrive (see `follow`), and opening again at the latest
 * when it falls behind.
 */
function useWindowState(
  session: string,
  source: WindowSource,
  anchor: string | undefined,
) {
  const queryClient = useQueryClient();
  const [openedAt] = useState(Date.now);
  // What's in the cache from before is current if the conversation was
  // still live; otherwise only what the PDS has sent since opening is.
  const [liveBefore] = useState(() =>
    isLive(queryClient, session, source.conversationId),
  );
  const [state, setState] = useState<WindowState>(() => ({
    next: undefined,
    view:
      anchor === undefined || source.threadId !== undefined
        ? openLatest(queryClient, session, source, openedAt)
        : anchoredView(anchor),
  }));
  const { next, view } = state;
  remember(windowKeyOf(session, source), view);
  const results = useQueries({
    queries: [...view.pages, ...(next?.pages ?? [])].map((cursor) =>
      pageQuery(session, source, cursor),
    ),
  });
  function resultsOf(shown: View | undefined, offset: number) {
    return (shown?.pages ?? []).map((_, index) => {
      const result = results[offset + index];
      return result?.data === undefined
        ? undefined
        : {
            at: result.dataUpdatedAt,
            data: result.data,
            fresh: liveBefore || result.dataUpdatedAt >= openedAt,
          };
    });
  }
  const followed = follow(
    state,
    resultsOf(view, 0),
    resultsOf(next, view.pages.length),
  );
  if (followed !== state) setState(followed);
  return { results, setState, state };
}

/** What the screen asks of the window, besides what it shows. */
function windowActions(
  setState: SetWindowState,
  windowKey: string,
  { first, last, live, messages }: ReturnType<typeof shownPages>,
) {
  function addPage(cursor: PageCursor, at: "end" | "start") {
    setState((current) => ({
      ...current,
      view: withPage(current.view, cursor, at),
    }));
  }
  return {
    /** Shows the window it's been opening instead. */
    showNext: () =>
      setState((current) =>
        current.next === undefined
          ? current
          : { next: undefined, view: current.next },
      ),
    /**
     * Opens at the latest messages, keeping what's shown until they've
     * loaded.
     */
    jumpToLatest: () =>
      setState((current) => ({
        ...current,
        next: current.next ?? latestView(Date.now()),
      })),
    /**
     * Opens instead at the latest messages as they were at `openedAt`, as
     * saved then (see `features/saved`). Messages since then join below
     * them as they load, so nothing already showing moves.
     */
    openAt: (savedAt: number) => {
      const saved = latestView(savedAt);
      lastWindows.set(windowKey, { at: Date.now(), view: saved });
      setState(() => ({ next: undefined, view: saved }));
    },
    loadNewer: () => {
      const newest = messages.at(-1);
      if (live || last?.hasNewer !== true || newest === undefined) return;
      addPage(pageAfter(newest), "end");
    },
    loadOlder: () => {
      const oldest = messages[0];
      if (first?.hasOlder !== true || oldest === undefined) return;
      addPage({ before: oldest.sentAt }, "start");
    },
  };
}

/** What the window's loaded pages show. */
function shownPages(view: View, pages: readonly { data?: Page }[]) {
  const data = pages.map((page) => page.data);
  return {
    first: data[0],
    last: data.at(-1),
    /**
     * At the latest messages and following new ones. Its newest page can
     * be momentarily full while the next one loads; the window is still at
     * the latest.
     */
    live: view.liveSince !== undefined,
    messages: mergePages(data),
    parts: windowParts(view, data),
    root: data.find((page) => page?.root != null)?.root ?? null,
  };
}

/**
 * A scrollable window over a conversation (or a thread's replies), oldest
 * first, that can open at the latest message or around a specific one and
 * grow in either direction. At the latest messages it follows new ones as
 * they arrive (see window-model.ts).
 */
export function useMessageWindow(
  session: string,
  source: WindowSource,
  anchor?: string,
) {
  const { results, setState, state } = useWindowState(session, source, anchor);
  const { next, view } = state;
  const shown = shownPages(view, results.slice(0, view.pages.length));
  return {
    ...windowActions(setState, windowKeyOf(session, source), shown),
    anchor: view.anchor,
    /** Which queries the loaded pages' reactions and threads come from. */
    parts: shown.parts,
    /** A thread's original message, once a page has it. */
    root: shown.root,
    /**
     * Each page by key, oldest first, with its data once it has loaded,
     * and whether it is one the window opened with.
     */
    pages: pagesOf(view, results),
    /**
     * The window it's opening instead (see `jumpToLatest`), with its
     * pages and parts, shown once they've loaded (`showNext`).
     */
    next:
      next === undefined
        ? undefined
        : {
            pages: pagesOf(next, results, view.pages.length),
            parts: windowParts(
              next,
              results.slice(view.pages.length).map((page) => page.data),
            ),
          },
    /** Changes whenever the window reopens, so lists can remount. */
    viewKey: pageKey(view.opened),
    live: shown.live,
    /** There are newer messages than the window has, out of its reach. */
    hasNewer: !shown.live && shown.last?.hasNewer === true,
    hasOlder: shown.first?.hasOlder === true,
    messages: shown.messages,
  };
}
