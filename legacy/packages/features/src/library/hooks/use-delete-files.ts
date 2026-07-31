import { useConvexMutation } from "@convex-dev/react-query";

import { api } from "@acme/db/api";

export function useDeleteFiles() {
  return useConvexMutation(api.app.library.deleteFiles).withOptimisticUpdate(
    (store, args) => {
      const toRemove = new Set<string>(args.ids);
      for (const q of store.getAllQueries(api.app.library.getUserFiles)) {
        if (!q.value) continue;
        const nextPage = q.value.page.filter((file) => !toRemove.has(file.id));
        if (nextPage.length === q.value.page.length) continue;
        store.setQuery(api.app.library.getUserFiles, q.args, {
          ...q.value,
          page: nextPage,
        });
      }
    },
  );
}
