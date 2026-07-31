import { useConvexMutation } from "@convex-dev/react-query";

import { api } from "@acme/db/api";

export function useDeleteThread() {
  return useConvexMutation(api.ai.thread.lifecycle.remove);
}
