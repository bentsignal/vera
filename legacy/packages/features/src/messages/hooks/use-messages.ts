// eslint-disable-next-line no-restricted-imports -- useQuery reads the SSR-prefetched first page so messages are in hand on the first client render, avoiding an extra Convex round trip before the list fades in at the bottom
import { useQuery } from "@tanstack/react-query";

import { api } from "@acme/db/api";

import type {
  MyDataParts,
  MyMetadata,
  MyTools,
  MyUIMessage,
} from "../types/message-types";
import { threadQueries } from "../../thread/lib/queries";
import { toUIMessages, useThreadMessages } from "../agent";
import { INITIAL_PAGE_SIZE } from "../config/message-config";

export function useMessages({
  threadId,
  streaming = false,
}: {
  threadId: string;
  streaming?: boolean;
}) {
  const firstPageQuery = useQuery({
    ...threadQueries.messagesFirstPage(threadId),
    select: (data) => data.page,
  });

  const {
    results: messages,
    loadMore,
    isLoading,
    status,
  } = useThreadMessages(
    api.ai.thread.messages.list,
    { threadId },
    {
      initialNumItems: INITIAL_PAGE_SIZE,
      stream: streaming,
    },
  );

  // Only fall back to the prefetched first page while the live paginated
  // query is fetching its *first* page. `isLoading` from usePaginatedQuery is
  // also true during `LoadingMore`, so using it here would make the messages
  // array shrink back to the first 10 mid-pagination and break scroll anchoring.
  const isFirstPageLoading = status === "LoadingFirstPage";
  const shouldUseLiveResults = !isFirstPageLoading && messages.length > 0;
  const activeMessages = shouldUseLiveResults
    ? messages
    : (firstPageQuery.data ?? messages);

  const rawUIMessages = toUIMessages<MyMetadata, MyDataParts, MyTools>(
    activeMessages,
  );

  const uiMessages = rawUIMessages.map((message: MyUIMessage) => {
    const nonUIMessage = activeMessages.find((m) => m._id === message.id);
    if (!nonUIMessage) {
      return message;
    }
    const attachments = nonUIMessage.attachments;
    return {
      ...message,
      metadata: {
        ...message.metadata,
        attachments: attachments,
      },
    } as const satisfies MyUIMessage;
  });

  return {
    messages: uiMessages,
    totalCount: activeMessages.length,
    loadMore,
    isLoading,
    status,
  };
}
