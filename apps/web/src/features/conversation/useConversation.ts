import type { Message } from "@decentralized-convex/messages";
import type { FormEvent } from "react";
import { useEffect, useEffectEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  mapPdsQueryData,
  pdsMutation,
  pdsQuery,
  useQuery,
} from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { prototypeConversation } from "../pds/model.ts";

export function useConversation() {
  const conversation = useMutation(pdsMutation(pds.messages.putConversation));
  const query = useQuery({
    enabled: conversation.isSuccess,
    query: pdsQuery(pds.messages.list, {
      conversationId: prototypeConversation.id,
    }),
    select: (data) => mapPdsQueryData(data, combineMessages),
  });
  const sendMessage = useMutation(pdsMutation(pds.messages.send));
  const [draft, setDraft] = useState("");
  const saveConversation = useEffectEvent(() => {
    conversation.mutate({
      conversationId: prototypeConversation.id,
      participants: [...prototypeConversation.participants],
    });
  });

  useEffect(() => {
    saveConversation();
  }, []);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (body.length === 0 || sendMessage.isPending) return;

    sendMessage.reset();
    try {
      await sendMessage.mutateAsync({
        body,
        conversationId: prototypeConversation.id,
        messageId: crypto.randomUUID(),
      });
      setDraft("");
    } catch {
      // TanStack Query exposes the mutation error to the composer below.
    }
  }

  return {
    composer: {
      draft,
      error: conversation.error?.message ?? sendMessage.error?.message,
      sending: sendMessage.isPending,
      setDraft,
      submit: send,
    },
    messages: query,
  };
}

function combineMessages(messages: readonly Message[]) {
  const byId = new Map(messages.map((message) => [message.messageId, message]));
  return [...byId.values()].sort(
    (left, right) =>
      left.sentAt - right.sentAt ||
      left.messageId.localeCompare(right.messageId),
  );
}
