import type { FormEvent } from "react";
import { useState } from "react";
import { useDecentralizedConvex } from "@decentralized-convex/react";
import { useFederatedPdsQuery } from "@decentralized-convex/tanstack-query";

import type { HomeServer } from "../live/config.ts";
import { conversation } from "../live/config.ts";
import { messagesQueryOptions, pdsApi } from "../live/queries.ts";

interface UseChatRoomOptions {
  home: HomeServer;
  homes: readonly HomeServer[];
  user: { actor: string };
}

export function useChatRoom({ home, homes, user }: UseChatRoomOptions) {
  const client = useDecentralizedConvex();
  const messages = useFederatedPdsQuery(messagesQueryOptions(homes));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (body.length === 0 || sending) return;

    setError(undefined);
    setSending(true);
    try {
      await client.pdsMutation(
        { id: user.actor, url: home.convexUrl },
        pdsApi.messages.mutations.send({
          body,
          conversationId: conversation.id,
          messageId: crypto.randomUUID(),
        }),
      );
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message failed");
    } finally {
      setSending(false);
    }
  }

  return {
    composer: { draft, error, sending, setDraft, submit: send },
    messages,
  };
}
