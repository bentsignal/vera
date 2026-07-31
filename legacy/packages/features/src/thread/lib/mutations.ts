import { mutationOptions } from "@tanstack/react-query";

import { useAbortThread } from "../hooks/use-abort-thread";
import { useCreateThread } from "../hooks/use-create-thread";
import { useDeleteThread } from "../hooks/use-delete-thread";
import { useRenameThread } from "../hooks/use-rename-thread";
import { useSendMessageInThread } from "../hooks/use-send-message-in-thread";
import { useTogglePinnedThread } from "../hooks/use-toggle-pinned-thread";

export function useThreadMutations() {
  return {
    create: mutationOptions({
      mutationKey: ["thread-create"],
      mutationFn: useCreateThread(),
    }),
    rename: mutationOptions({
      mutationKey: ["thread-rename"],
      mutationFn: useRenameThread(),
    }),
    sendMessageInThread: mutationOptions({
      mutationKey: ["thread-send-message"],
      mutationFn: useSendMessageInThread(),
    }),
    abort: mutationOptions({
      mutationKey: ["thread-abort"],
      mutationFn: useAbortThread(),
    }),
    delete: mutationOptions({
      mutationKey: ["thread-delete"],
      mutationFn: useDeleteThread(),
    }),
    togglePinned: mutationOptions({
      mutationKey: ["thread-toggle-pinned"],
      mutationFn: useTogglePinnedThread(),
    }),
  };
}
