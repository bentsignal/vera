import { useConvexMutation } from "@convex-dev/react-query";

import { api } from "@acme/db/api";

export function useRenameFile() {
  return useConvexMutation(api.app.library.renameFile).withOptimisticUpdate(
    (store, args) => {
      for (const q of store.getAllQueries(api.app.library.getUserFiles)) {
        if (!q.value) continue;
        const target = q.value.page.find((file) => file.id === args.id);
        if (!target) continue;
        const nextPage = q.value.page.map((file) =>
          file.id === args.id ? { ...file, fileName: args.name } : file,
        );
        store.setQuery(api.app.library.getUserFiles, q.args, {
          ...q.value,
          page: nextPage,
        });
      }
    },
  );
}
