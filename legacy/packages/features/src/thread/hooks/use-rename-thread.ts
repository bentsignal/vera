import { useConvexMutation } from "@convex-dev/react-query";

import { api } from "@acme/db/api";

export function useRenameThread() {
  return useConvexMutation(api.ai.thread.title.rename).withOptimisticUpdate(
    (store, args) => {
      store.setQuery(
        api.ai.thread.title.get,
        { threadId: args.threadId },
        args.name,
      );
      function matches(entry: { id: string; clientId?: string }) {
        return entry.id === args.threadId || entry.clientId === args.threadId;
      }
      for (const q of store.getAllQueries(api.ai.thread.list.get)) {
        if (!q.value) continue;
        if (!q.value.page.some(matches)) continue;
        const nextPage = q.value.page.map((entry) =>
          matches(entry) ? { ...entry, title: args.name } : entry,
        );
        store.setQuery(api.ai.thread.list.get, q.args, {
          ...q.value,
          page: nextPage,
        });
      }
    },
  );
}
