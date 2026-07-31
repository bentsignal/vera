import type { OptimisticLocalStore } from "convex/browser";
import type { Infer } from "convex/values";
import { useConvexMutation } from "@convex-dev/react-query";

import type {
  vAttachment,
  vEnrichedMessage,
  vListThreadReturn,
  vPublicFile,
  vThreadListEntry,
} from "@acme/db/thread/shared";
import { api } from "@acme/db/api";

import { randomUUID } from "../../messages/agent/optimisticallySendMessage";
import { INITIAL_PAGE_SIZE as MESSAGE_PAGE_SIZE } from "../../messages/config/message-config";

// Seeds the thread list + all per-thread queries (state, messages, title,
// followUps) so the `/chat/$clientId` route loader resolves synchronously
// against cache and the page renders instantly with the user's message.
function optimisticallyCreateThread(
  store: OptimisticLocalStore,
  args: {
    clientId: string;
    prompt: string;
    attachments?: Infer<typeof vAttachment>[];
  },
) {
  const optimisticAttachments = (args.attachments ?? [])
    .filter(
      (
        a,
      ): a is Infer<typeof vAttachment> & {
        id: NonNullable<Infer<typeof vAttachment>["id"]>;
        url: NonNullable<Infer<typeof vAttachment>["url"]>;
        size: NonNullable<Infer<typeof vAttachment>["size"]>;
      } => a.id !== undefined && a.url !== undefined && a.size !== undefined,
    )
    .map(
      (a): Infer<typeof vPublicFile> => ({
        id: a.id,
        key: a.key,
        url: a.url,
        fileName: a.name,
        mimeType: a.mimeType,
        size: a.size,
      }),
    );
  const optimisticEntry = {
    id: args.clientId,
    clientId: args.clientId,
    updatedAt: Date.now(),
    title: "New Chat",
    latestEvent: "user_message_sent",
    pinned: false,
  } satisfies Infer<typeof vThreadListEntry>;
  // `insertAtTop` has proven unreliable against `usePaginatedQuery`'s internal
  // cache keys (pagination opts include a hook-generated id that
  // `argsToMatch` can't narrow to). Iterate every live subscription to
  // `list.get` and prepend the entry to each first page whose `search` is
  // empty. This reliably covers both the SSR-prefetched useQuery and the
  // live paginated subscription.
  for (const q of store.getAllQueries(api.ai.thread.list.get)) {
    if (q.args.search !== "") continue;
    if (q.args.paginationOpts.cursor !== null) continue;
    if (!q.value) continue;
    // Server orders pinned threads first, then unpinned by recency. Slot the
    // optimistic entry below the pinned block and above the rest.
    const firstUnpinned = q.value.page.findIndex((entry) => !entry.pinned);
    const insertAt = firstUnpinned === -1 ? q.value.page.length : firstUnpinned;
    const nextPage = [
      ...q.value.page.slice(0, insertAt),
      optimisticEntry,
      ...q.value.page.slice(insertAt),
    ];
    store.setQuery(api.ai.thread.list.get, q.args, {
      ...q.value,
      page: nextPage,
    });
  }
  store.setQuery(
    api.ai.thread.state.get,
    { threadId: args.clientId },
    "user_message_sent",
  );

  const messageId = randomUUID();
  const optimisticMessage = {
    _id: messageId,
    _creationTime: Date.now(),
    threadId: args.clientId,
    order: 0,
    stepOrder: 0,
    status: "pending",
    tool: false,
    message: { role: "user", content: args.prompt },
    text: args.prompt,
    attachments: optimisticAttachments,
  } satisfies Infer<typeof vEnrichedMessage>;
  const messagesPage = {
    page: [optimisticMessage],
    continueCursor: "",
    isDone: true,
    pageStatus: null,
    splitCursor: null,
    streams: { kind: "list", messages: [] },
  } satisfies Infer<typeof vListThreadReturn>;
  store.setQuery(
    api.ai.thread.messages.list,
    {
      threadId: args.clientId,
      paginationOpts: { numItems: MESSAGE_PAGE_SIZE, cursor: null },
      streamArgs: { kind: "list" },
    },
    messagesPage,
  );

  store.setQuery(
    api.ai.thread.title.get,
    { threadId: args.clientId },
    "New Chat",
  );
  store.setQuery(api.ai.thread.followUps.get, { threadId: args.clientId }, []);
}

export function useCreateThread() {
  return useConvexMutation(api.ai.thread.lifecycle.create).withOptimisticUpdate(
    optimisticallyCreateThread,
  );
}
