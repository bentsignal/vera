import { useConvexMutation } from "@convex-dev/react-query";

import { api } from "@acme/db/api";

import { optimisticallySendMessage } from "../../messages/agent/optimisticallySendMessage";

export function useSendMessageInThread() {
  return useConvexMutation(api.ai.thread.messages.send).withOptimisticUpdate(
    (store, args) => {
      optimisticallySendMessage(api.ai.thread.messages.list)(store, args);
      store.setQuery(
        api.ai.thread.state.get,
        { threadId: args.threadId },
        "user_message_sent",
      );
    },
  );
}
