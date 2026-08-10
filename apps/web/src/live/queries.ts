import type { Message } from "@decentralized-convex/messages";
import { definePdsApi } from "@decentralized-convex/client";
import { messagesProtocol } from "@decentralized-convex/messages";
import { federatedPdsQueryOptions } from "@decentralized-convex/tanstack-query";

import type { HomeServer } from "./config.ts";
import { conversation } from "./config.ts";

export type ChatMessage = Message;

export const pdsApi = definePdsApi({ messages: messagesProtocol });

export function messagesQueryOptions(homes: readonly HomeServer[]) {
  return federatedPdsQueryOptions({
    combine: (sources) =>
      combineMessages(sources.flatMap((source) => source.data)),
    queryKey: ["messages", conversation.id],
    request: pdsApi.messages.queries.list({
      conversationId: conversation.id,
    }),
    targets: homes.map((home) => ({
      id: `member@${home.domain}`,
      url: home.convexUrl,
    })),
  });
}

function combineMessages(messages: readonly ChatMessage[]) {
  const byId = new Map(messages.map((message) => [message.messageId, message]));
  return [...byId.values()].sort(
    (left, right) =>
      left.sentAt - right.sentAt ||
      left.messageId.localeCompare(right.messageId),
  );
}
