import type { FormEvent } from "react";
import { useState } from "react";
import { useDecentralizedConvex } from "@decentralized-convex/react";
import { useFederatedQuery } from "@decentralized-convex/tanstack-query";
import { api } from "@vera/backend/api";

import type { HomeServer } from "../live/config.ts";
import { conversation } from "../live/config.ts";
import { messagesQueryOptions } from "../live/queries.ts";

interface UseChatRoomOptions {
  home: HomeServer;
  user: { actor: string };
}

export function useChatRoom({ home, user }: UseChatRoomOptions) {
  const client = useDecentralizedConvex();
  const messages = useFederatedQuery(messagesQueryOptions());
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
      await client.mutation(
        { id: user.actor, url: home.convexUrl },
        api.messages.send,
        {
          body,
          eventId: crypto.randomUUID(),
          roomId: conversation.id,
          sentAt: Date.now(),
        },
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
