import { useConvexMutation } from "@convex-dev/react-query";

import { api } from "@acme/db/api";

export function useTogglePinnedThread() {
  return useConvexMutation(api.ai.thread.pinned.toggle).withOptimisticUpdate(
    (store, args) => {
      function matches(entry: { id: string; clientId?: string }) {
        return entry.id === args.threadId || entry.clientId === args.threadId;
      }
      for (const q of store.getAllQueries(api.ai.thread.list.get)) {
        if (!q.value) continue;
        if (!q.value.page.some(matches)) continue;
        // Server orders pinned first, then unpinned by updatedAt desc. Flip
        // and re-sort so the toggled row jumps to the right bucket.
        const nextPage = q.value.page
          .map((entry) =>
            matches(entry) ? { ...entry, pinned: !entry.pinned } : entry,
          )
          .sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return b.updatedAt - a.updatedAt;
          });
        store.setQuery(api.ai.thread.list.get, q.args, {
          ...q.value,
          page: nextPage,
        });
      }
    },
  );
}
