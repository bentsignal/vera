// eslint-disable-next-line no-restricted-imports -- non-suspending useQuery is intentional for threadQueries.state so this hook reacts to activeThread changes without triggering a suspense boundary on every thread switch
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ConvexError } from "convex/values";
import { toast } from "sonner";

import type { LibraryFile } from "../../library/types/library-types";
import { billingQueries } from "../../billing/lib/queries";
import { validatePrompt } from "../../lib/prompt";
import { tryCatch } from "../../lib/result";
import { randomUUID } from "../../messages/agent/optimisticallySendMessage";
import { useMessageStore } from "../../messages/store/message-store";
import { useThreadMutations } from "../../thread/lib/mutations";
import { threadQueries } from "../../thread/lib/queries";
import { useThreadStore } from "../../thread/store/thread-store";
import { useComposerStore } from "../store/composer-store";

function mapAttachments(files: LibraryFile[]) {
  return files.map((file) => ({
    key: file.key,
    name: file.fileName,
    mimeType: file.mimeType,
    id: file.id,
    url: file.url,
    size: file.size,
  }));
}

function handleConvexError(error: unknown, handleError?: () => void) {
  handleError?.();
  if (error instanceof ConvexError) {
    toast.error(String(error.data));
    return;
  }
  toast.error("An internal error occurred. Please try again.");
}

type CreateThreadFn = (args: {
  clientId: string;
  prompt: string;
  attachments: ReturnType<typeof mapAttachments>;
}) => Promise<unknown>;

type SendMessageInThreadFn = (args: {
  threadId: string;
  prompt: string;
  attachments: ReturnType<typeof mapAttachments>;
}) => Promise<unknown>;

interface ThreadActionDeps {
  createThread: CreateThreadFn;
  sendMessageInThread: SendMessageInThreadFn;
  navigateToThread: (threadId: string) => void;
}

async function handleCreateThread(
  deps: ThreadActionDeps,
  {
    prompt,
    attachedFiles,
    clearAttachments,
    navigateToNewThread,
    handleError,
  }: {
    prompt: string;
    attachedFiles: LibraryFile[];
    clearAttachments: () => void;
    navigateToNewThread: boolean;
    handleError?: () => void;
  },
) {
  // Generate a client-side id, fire the mutation FIRST so its optimistic
  // update seeds sidebar + thread queries synchronously, then navigate.
  // Navigating before the mutation call would let the route transition
  // paint a frame before the optimistic entry lands in the sidebar cache.
  const clientId = randomUUID();
  clearAttachments();
  const mutationPromise = deps.createThread({
    clientId,
    prompt,
    attachments: mapAttachments(attachedFiles),
  });
  if (navigateToNewThread) {
    deps.navigateToThread(clientId);
  }
  const { error: threadCreationError } = await tryCatch(mutationPromise);
  if (threadCreationError) {
    handleConvexError(threadCreationError, handleError);
    return;
  }
  return clientId;
}

async function handleSendToThread(
  deps: ThreadActionDeps,
  {
    threadId,
    prompt,
    attachedFiles,
    clearAttachments,
    handleError,
  }: {
    threadId: string;
    prompt: string;
    attachedFiles: LibraryFile[];
    clearAttachments: () => void;
    handleError?: () => void;
  },
) {
  const { error: newThreadMessageError } = await tryCatch(
    deps.sendMessageInThread({
      threadId,
      prompt,
      attachments: mapAttachments(attachedFiles),
    }),
  );
  if (newThreadMessageError) {
    handleConvexError(newThreadMessageError, handleError);
    return;
  }
  clearAttachments();
}

interface UseSendMessageOptions {
  navigateToThread: (threadId: string) => void;
}

export function useSendMessage({ navigateToThread }: UseSendMessageOptions) {
  const setPrompt = useComposerStore((state) => state.setPrompt);
  const mutations = useThreadMutations();
  const { mutateAsync: createThread } = useMutation(mutations.create);
  const { mutateAsync: sendMessageInThread } = useMutation(
    mutations.sendMessageInThread,
  );
  const deps = { createThread, sendMessageInThread, navigateToThread };

  const activeThread = useThreadStore((state) => state.activeThread);
  const { data: threadState } = useQuery({
    ...threadQueries.state(activeThread ?? ""),
    select: (state) => state,
  });
  const { data: limitHit } = useSuspenseQuery({
    ...billingQueries.usage(),
    select: (data) => data.limitHit,
  });

  const storeIsTranscribing = useComposerStore(
    (state) => state.storeIsTranscribing,
  );
  const isRecording = useComposerStore((state) => state.storeIsRecording);

  // Treat pending (undefined) as idle so the composer doesn't spuriously
  // flag "generating" while the query is still loading on first mount.
  const isGenerating = threadState != null;
  const blockSend = isGenerating || isRecording || limitHit;
  const isLoading = isGenerating || storeIsTranscribing;

  const setNumMessagesSent = useMessageStore(
    (state) => state.setNumMessagesSent,
  );

  async function sendMessage({
    customPrompt,
    navigateToNewThread = true,
    showInstantLoad,
    handleError,
  }: {
    customPrompt?: string;
    navigateToNewThread?: boolean;
    showInstantLoad?: () => void;
    handleError?: () => void;
  } = {}) {
    const rawPrompt = customPrompt ?? useComposerStore.getState().prompt;

    if (blockSend) return;

    const prompt = validatePrompt(rawPrompt);
    if (!prompt) return;

    setPrompt("");
    showInstantLoad?.();

    const currentThread = useThreadStore.getState().activeThread;
    setNumMessagesSent(useMessageStore.getState().numMessagesSent + 1);
    const attachedFiles = useComposerStore.getState().attachedFiles;
    const clearAttachments = useComposerStore.getState().clearAttachments;

    if (currentThread === null) {
      return await handleCreateThread(deps, {
        prompt,
        attachedFiles,
        clearAttachments,
        navigateToNewThread,
        handleError,
      });
    }

    await handleSendToThread(deps, {
      threadId: currentThread,
      prompt,
      attachedFiles,
      clearAttachments,
      handleError,
    });
  }

  return { blockSend, sendMessage, isLoading, isGenerating };
}
