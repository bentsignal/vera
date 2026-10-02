import type {
  Attachment,
  Conversation,
  Message as PdsMessage,
} from "@decentralized-convex/messages";
import { useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries.
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import type { Message } from "~/features/conversation/types";
import type { ConversationSummary } from "~/features/inbox/types";
import { useAccount } from "./account";
import { useDisplayNames, useProfiles } from "./profiles";
import { pdsResult } from "./results";

export function toMessage(message: PdsMessage) {
  return {
    attachments: message.attachments,
    authorId: message.authorId,
    body: message.body.length > 0 ? message.body : undefined,
    id: message.messageId,
    linkPreview: message.linkPreview ?? undefined,
    sentAt: new Date(message.sentAt),
  } satisfies Message;
}

function conversationTitle(
  conversation: Conversation,
  self: string,
  displayName: (id: string) => string,
) {
  if (conversation.kind === "channel") return `#${conversation.name ?? ""}`;
  if (conversation.kind === "group") return conversation.name ?? "Group";
  const other = conversation.members.find((member) => member !== self);
  return displayName(other ?? self);
}

function preview(message: PdsMessage | null, self: string, name: string) {
  if (message === null) return "No messages yet";
  const prefix = message.authorId === self ? "You: " : "";
  if (message.body.length > 0) return `${prefix}${message.body}`;
  const count = message.attachments.length;
  const kind = message.attachments[0]?.kind ?? "file";
  const noun = { file: "File", image: "Photo", video: "Video" }[kind];
  return `${prefix || `${name}: `}${count > 1 ? `${count} attachments` : noun}`;
}

export function useInbox() {
  const { address } = useAccount();
  const { data: conversations } = useQuery(
    pdsQuery({
      args: {},
      options: { select: pdsResult },
      query: pds.messages.inbox,
    }),
  );
  const profileOf = useProfiles(
    conversations?.flatMap((conversation) => conversation.members) ?? [],
  );
  function displayName(account: string) {
    return profileOf(account).displayName;
  }
  const summaries = conversations?.map((conversation) => {
    const other =
      conversation.kind === "direct"
        ? conversation.members.find((member) => member !== address)
        : undefined;
    return {
      id: conversation.conversationId,
      kind: conversation.kind,
      avatarSeed: other ?? conversation.conversationId,
      avatarUrl: other === undefined ? null : profileOf(other).avatarUrl,
      lastActivityAt: new Date(
        conversation.lastMessage?.sentAt ?? conversation.updatedAt,
      ),
      lastMessage: preview(
        conversation.lastMessage,
        address,
        displayName(conversation.lastMessage?.authorId ?? ""),
      ),
      memberIds: conversation.members,
      title: conversationTitle(conversation, address, displayName),
      unreadCount: conversation.unreadCount,
    } satisfies ConversationSummary;
  });
  return { conversations: summaries, isLoading: summaries === undefined };
}

export function useConversation(conversationId: string) {
  const { address } = useAccount();
  const { data } = useQuery(
    pdsQuery({
      args: { conversationId },
      options: { select: (result) => pdsResult(result)?.[0] },
      query: pds.messages.conversation,
    }),
  );
  const displayName = useDisplayNames(data?.members ?? []);
  return {
    conversation: data ?? undefined,
    displayName,
    isLoading: data === undefined,
    title: data ? conversationTitle(data, address, displayName) : "",
  };
}

interface PendingMessage {
  readonly attachments: Attachment[];
  readonly body: string;
  readonly failed: boolean;
  readonly messageId: string;
  readonly sentAt: number;
}

function usePendingMessages(conversationId: string) {
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const send = useMutation(pdsMutation({ mutation: pds.messages.send }));

  function markFailed(messageId: string) {
    setPending((current) =>
      current.map((item) =>
        item.messageId === messageId ? { ...item, failed: true } : item,
      ),
    );
  }

  function sendMessage(body: string, attachments: Attachment[] = []) {
    const message = {
      attachments,
      body,
      failed: false,
      messageId: Crypto.randomUUID(),
      sentAt: Date.now(),
    };
    setPending((current) => [...current, message]);
    send.mutate(
      { attachments, body, conversationId, messageId: message.messageId },
      { onError: () => markFailed(message.messageId) },
    );
  }

  return { pending, sendMessage };
}

/**
 * Live messages, newest first, with older pages loaded on demand and sends
 * shown immediately until the server confirms them.
 */
export function useMessages(conversationId: string) {
  const { address } = useAccount();
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const { pending, sendMessage } = usePendingMessages(conversationId);
  const pages = useQueries({
    queries: cursors.map((before) =>
      pdsQuery({
        args:
          before === undefined
            ? { conversationId }
            : { before, conversationId },
        options: { select: pdsResult },
        query: pds.messages.list,
      }),
    ),
  });

  const confirmed = new Map(
    pages
      .flatMap((page) => page.data ?? [])
      .flatMap((source) => source.messages)
      .map((message) => [message.messageId, message] as const),
  );
  const hasMore = pages.at(-1)?.data?.some((source) => source.hasMore) ?? false;
  const sorted = [...confirmed.values()].sort((a, b) => b.sentAt - a.sentAt);
  const unconfirmed = pending
    .filter((message) => !confirmed.has(message.messageId))
    .map((message) => ({
      ...toMessage({
        ...message,
        authorId: address,
        authorName: "",
        conversationId,
        linkPreview: null,
      }),
      status: message.failed ? ("failed" as const) : ("sending" as const),
    }));

  function loadOlder() {
    const oldest = sorted.at(-1);
    if (!hasMore || oldest === undefined || cursors.includes(oldest.sentAt)) {
      return;
    }
    setCursors((current) => [...current, oldest.sentAt]);
  }

  return {
    isLoading: pages[0]?.data === undefined,
    loadOlder,
    messages: [...unconfirmed, ...sorted.map(toMessage)],
    newestSentAt: sorted[0]?.sentAt,
    sendMessage,
  };
}

/** Marks the conversation read up to the newest message while it is open. */
export function useMarkRead(conversationId: string, newestSentAt?: number) {
  const { mutate } = useMutation(
    pdsMutation({ mutation: pds.messages.markRead }),
  );
  const lastMarked = useRef(0);
  // eslint-disable-next-line no-restricted-syntax -- Read state lives on the server and must follow messages arriving while the screen is open.
  useEffect(() => {
    if (newestSentAt === undefined || newestSentAt <= lastMarked.current) {
      return;
    }
    lastMarked.current = newestSentAt;
    mutate({ conversationId, readAt: newestSentAt });
  }, [conversationId, mutate, newestSentAt]);
}
