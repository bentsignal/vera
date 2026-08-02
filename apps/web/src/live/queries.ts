import type { FunctionReturnType } from "convex/server";
import { federatedQueryOptions } from "@decentralized-convex/tanstack-query";
import { api } from "@vera/backend/api";

import { conversation } from "./config.ts";

export type ChatMessage = FunctionReturnType<typeof api.messages.list>[number];

export function messagesQueryOptions() {
  return federatedQueryOptions({
    args: { roomId: conversation.id },
    combine: (sources) =>
      combineMessages(sources.flatMap((source) => source.data)),
    query: api.messages.list,
    queryKey: ["messages", conversation.id],
    targets: conversation.targets,
  });
}

function combineMessages(messages: readonly ChatMessage[]) {
  const byId = new Map(messages.map((message) => [message.eventId, message]));
  return [...byId.values()].sort(
    (a, b) => a.sentAt - b.sentAt || a.eventId.localeCompare(b.eventId),
  );
}
