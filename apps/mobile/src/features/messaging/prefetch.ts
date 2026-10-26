import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import {
  prefetchLatestMessages,
  refetchLatestMessages,
} from "./message-window";
import { typingQuery } from "./typing";

function conversationQuery(session: string, conversationId: string) {
  return pdsQuery({
    args: { conversationId },
    query: pds.messages.conversation,
    session,
  });
}

/**
 * Starts loading a conversation the moment a finger lands on its row, so
 * its messages (and anyone already typing) are often there by the time
 * the screen is.
 */
export function usePrefetchConversation() {
  const queryClient = useQueryClient();
  return (session: string, conversationId: string) => {
    void queryClient.prefetchQuery(conversationQuery(session, conversationId));
    void queryClient.prefetchQuery(typingQuery(session, conversationId));
    prefetchLatestMessages(queryClient, session, conversationId);
  };
}

/**
 * Fetches a conversation and its latest messages again, even if they're
 * cached, so what's saved of it can catch up (`refresh-saved`).
 */
export function refetchConversation(
  queryClient: QueryClient,
  session: string,
  conversationId: string,
) {
  return Promise.all([
    queryClient.fetchQuery({
      ...conversationQuery(session, conversationId),
      staleTime: 0,
    }),
    refetchLatestMessages(queryClient, session, conversationId),
  ]);
}
