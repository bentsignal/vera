import { useConvexMutation } from "@convex-dev/react-query";

import { api } from "@acme/db/api";

export function useAbortThread() {
  return useConvexMutation(api.ai.thread.generation.abort).withOptimisticUpdate(
    (store, args) => {
      store.setQuery(
        api.ai.thread.state.get,
        { threadId: args.threadId },
        null,
      );
    },
  );
}
