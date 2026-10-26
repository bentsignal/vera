import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";

import { useAccount, useVisibleAccounts } from "~/features/messaging/account";
import { inboxQuery } from "~/features/messaging/inbox";
import { typingQueryKey } from "~/features/messaging/typing";
import { hasResult, liveResult, showSaved } from "./saved-cache";
import { conversationFile, inboxFile, readSaved } from "./saved-files";
import { useSavedFallback } from "./use-saved-fallback";

/**
 * Shows an account's saved Home (its Inbox and Spaces) as its session
 * starts, so the app opens on it at once; its PDS's answers replace it as
 * they arrive.
 */
export function showSavedHome(queryClient: QueryClient, storagePrefix: string) {
  const saved = readSaved(inboxFile(storagePrefix));
  if (saved !== undefined) showSaved(queryClient, saved);
}

/**
 * Counts each visible account's PDS as not answering if its Inbox hasn't
 * come from it by the deadline (what's saved shows from the start, see
 * `showSavedHome`), and shows what's saved if anything is and it isn't
 * already.
 */
export function useSavedHome() {
  const queryClient = useQueryClient();
  const accounts = useVisibleAccounts();
  useSavedFallback(
    accounts.map(({ address }) => address),
    true,
    () =>
      accounts.flatMap(({ address, storagePrefix }) => {
        const query = queryClient
          .getQueryCache()
          .find({ exact: true, queryKey: inboxQuery(address).queryKey });
        if (liveResult(query) !== undefined) return [];
        if (!hasResult(query?.state.data)) {
          showSavedHome(queryClient, storagePrefix);
        }
        return [address];
      }),
  );
}

/**
 * Shows a conversation's saved messages if it's still loading at the
 * deadline.
 *
 * A conversation opening at its latest messages opens instead at the
 * window they were saved from (`openAt`), if its own pages haven't
 * loaded: the messages since then join below them as they load. One
 * opening at a particular message (its `anchor`) keeps its window and
 * only takes the names, photos, and details it's missing.
 */
export function useSavedConversation(
  conversationId: string,
  window: {
    anchor: string | undefined;
    openAt: (openedAt: number) => void;
    pages: readonly { initial: boolean; messageIds?: readonly string[] }[];
  },
  loading: boolean,
) {
  const queryClient = useQueryClient();
  const { address, session } = useAccount();
  useSavedFallback([address], loading, () => {
    const saved = readSaved(
      conversationFile(session.storagePrefix, conversationId),
    );
    if (saved === undefined) return [address];
    showSaved(queryClient, saved);
    // Who's typing isn't saved: nobody, until the PDS says.
    showSaved(queryClient, {
      entries: [{ key: typingQueryKey(address, conversationId), result: [] }],
      savedAt: saved.savedAt,
    });
    const pagesLoaded = window.pages.every(
      (page) => !page.initial || page.messageIds !== undefined,
    );
    if (
      window.anchor === undefined &&
      !pagesLoaded &&
      saved.openedAt !== undefined
    ) {
      window.openAt(saved.openedAt);
    }
    return [address];
  });
}
