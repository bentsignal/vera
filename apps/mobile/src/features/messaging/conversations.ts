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

import type { ReactionSummary } from "./reactions";
import type { Message } from "~/features/conversation/types";
import type { ConversationSummary } from "~/features/inbox/types";
import { useAccount, useVisibleAccounts } from "./account";
import { useMessageWindow } from "./message-window";
import { useProfiles, useProfileState } from "./profiles";
import { useReactions } from "./reactions";
import { pdsResult } from "./results";

export function toMessage(
  message: PdsMessage,
  reactions: readonly ReactionSummary[] | undefined,
) {
  return {
    attachments: message.attachments,
    authorId: message.authorId,
    body: message.body.length > 0 ? message.body : undefined,
    id: message.messageId,
    linkPreview: message.linkPreview ?? undefined,
    reactions,
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

/** The last message, led by its author where several people talk. */
function preview(
  message: PdsMessage | null,
  self: string,
  name: string,
  shared: boolean,
) {
  if (message === null) return "No messages yet";
  const prefix =
    message.authorId === self ? "You: " : shared ? `${name}: ` : "";
  if (message.body.length > 0) return `${prefix}${message.body}`;
  const count = message.attachments.length;
  const kind = message.attachments[0]?.kind ?? "file";
  const noun = { file: "File", image: "Photo", video: "Video" }[kind];
  return `${prefix || `${name}: `}${count > 1 ? `${count} attachments` : noun}`;
}

function summarize(
  account: string,
  conversation: Conversation,
  profileOf: ReturnType<typeof useProfiles>,
) {
  function displayName(address: string) {
    return profileOf(address).displayName;
  }
  const other =
    conversation.kind === "direct"
      ? conversation.members.find((member) => member !== account)
      : undefined;
  return {
    account,
    id: conversation.conversationId,
    key: `${account} ${conversation.conversationId}`,
    kind: conversation.kind,
    avatarUrl: other === undefined ? null : profileOf(other).avatarUrl,
    affiliated: other !== undefined && profileOf(other).affiliated,
    lastActivityAt: new Date(
      conversation.lastMessage?.sentAt ?? conversation.updatedAt,
    ),
    lastMessage: preview(
      conversation.lastMessage,
      account,
      displayName(conversation.lastMessage?.authorId ?? ""),
      conversation.kind !== "direct",
    ),
    hasMessages: conversation.lastMessage !== null,
    memberIds: conversation.members,
    muted: conversation.muted,
    pinnedAt: conversation.pinnedAt ?? null,
    spaceId: conversation.spaceId,
    spaceName: conversation.spaceName ?? null,
    title: conversationTitle(conversation, account, displayName),
    unreadCount: conversation.unreadCount,
  } satisfies ConversationSummary;
}

/**
 * Conversations across the visible accounts (or just `account`), newest
 * first: direct messages, groups, and the space channels shown in the
 * inbox. Each summary says which account it belongs to.
 */
export function useInbox({ account }: { account?: string } = {}) {
  const visible = useVisibleAccounts();
  const accounts =
    account === undefined ? visible.map((item) => item.address) : [account];
  const inboxes = useQueries({
    queries: accounts.map((session) =>
      pdsQuery({
        args: { channels: true },
        options: { select: pdsResult },
        query: pds.messages.inbox,
        session,
      }),
    ),
  });
  const conversations = inboxes.flatMap((inbox, index) =>
    (inbox.data ?? []).map((conversation) => ({
      account: accounts[index] ?? "",
      conversation,
    })),
  );
  const profiles = useProfileState(
    conversations.flatMap(({ conversation }) => conversation.members),
  );
  const summaries = conversations.map((item) =>
    summarize(item.account, item.conversation, profiles.profileOf),
  );
  // Order by the last message, matching the times shown on each row.
  summaries.sort(
    (left, right) =>
      right.lastActivityAt.getTime() - left.lastActivityAt.getTime(),
  );
  // Wait for names too, so rows never switch from usernames to names.
  const isLoading =
    inboxes.every((inbox) => inbox.data === undefined) || profiles.isLoading;
  return { conversations: isLoading ? undefined : summaries, isLoading };
}

export function useConversation(conversationId: string) {
  const { address } = useAccount();
  const { data } = useQuery(
    pdsQuery({
      args: { conversationId },
      options: { select: (result) => pdsResult(result)?.[0] },
      query: pds.messages.conversation,
      session: address,
    }),
  );
  const profileOf = useProfiles(data?.members ?? []);
  function displayName(account: string) {
    return profileOf(account).displayName;
  }
  return {
    conversation: data ?? undefined,
    displayName,
    isLoading: data === undefined,
    profileOf,
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
  const { address } = useAccount();
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const send = useMutation(
    pdsMutation({ mutation: pds.messages.send, session: address }),
  );

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
 * Messages oldest first, opened at the latest message or around `anchor`,
 * with this device's unconfirmed sends at the end.
 */
export function useMessages(conversationId: string, anchor?: string) {
  const { address } = useAccount();
  const view = useMessageWindow(address, conversationId, anchor);
  const { reactionsOf, toggle } = useReactions(
    address,
    conversationId,
    view.pageMessageIds,
  );
  const { pending, sendMessage } = usePendingMessages(conversationId);
  const confirmed = new Set(view.messages.map((message) => message.messageId));
  const atLatest = !view.hasNewer;
  const unconfirmed = atLatest
    ? pending
        .filter((message) => !confirmed.has(message.messageId))
        .map((message) => ({
          ...toMessage(
            {
              ...message,
              authorId: address,
              authorName: "",
              conversationId,
              linkPreview: null,
            },
            [],
          ),
          status: message.failed ? ("failed" as const) : ("sending" as const),
        }))
    : [];

  return {
    ...view,
    messages: [
      ...view.messages.map((message) =>
        toMessage(message, reactionsOf(message.messageId)),
      ),
      ...unconfirmed,
    ],
    /** Adds or removes your reaction, showing it right away. */
    toggleReaction: toggle,
    /** Only set when the newest loaded message is the newest there is. */
    newestSentAt: atLatest ? view.messages.at(-1)?.sentAt : undefined,
    sendMessage: (body: string, attachments: Attachment[] = []) => {
      if (!atLatest) view.jumpToLatest();
      sendMessage(body, attachments);
    },
  };
}

/** Marks the conversation read up to the newest message while it is open. */
export function useMarkRead(conversationId: string, newestSentAt?: number) {
  const { address } = useAccount();
  const { mutate } = useMutation(
    pdsMutation({ mutation: pds.messages.markRead, session: address }),
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
