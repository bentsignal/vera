import type {
  Conversation,
  Message as PdsMessage,
} from "@decentralized-convex/messages";
import { useState } from "react";

import type { InboxSnapshot } from "./inbox-rows";
import type { ConversationSummary } from "~/features/inbox/types";
import { useVisibleAccounts } from "./account";
import { conversationAlerts } from "./alerts";
import { conversationTitle } from "./conversations";
import { useInboxes } from "./inbox-rows";
import { useProfileState } from "./profiles";

/** A message's text, or what it sent instead ("Photo", "3 attachments"). */
export function messageSummary(message: PdsMessage) {
  if (message.deletedAt !== undefined) return "This message was deleted";
  if (message.body.length > 0) return message.body;
  const count = message.attachments.length;
  const kind = message.attachments[0]?.kind ?? "file";
  const noun = { file: "File", image: "Photo", video: "Video" }[kind];
  return count > 1 ? `${count} attachments` : noun;
}

/** The last message, led by its author where several people talk. */
export function preview(
  message: PdsMessage | null,
  self: string,
  name: string,
  shared: boolean,
) {
  if (message === null) return "No messages yet";
  const prefix =
    message.authorId === self ? "You: " : shared ? `${name}: ` : "";
  if (message.body.length > 0 && message.deletedAt === undefined) {
    return `${prefix}${message.body}`;
  }
  return `${prefix || `${name}: `}${messageSummary(message)}`;
}

function summarize(
  account: string,
  conversation: Conversation,
  profileOf: ReturnType<typeof useProfileState>["profileOf"],
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
    alerts: conversationAlerts(conversation),
    pinnedAt: conversation.pinnedAt ?? null,
    spaceId: conversation.spaceId,
    spaceName: conversation.spaceName ?? null,
    title: conversationTitle(conversation, account, displayName),
    unreadCount: conversation.unreadCount,
  } satisfies ConversationSummary;
}

/**
 * The people whose profiles a conversation's row shows: the other person
 * in a direct conversation, an unnamed group's members (its title), and
 * the last message's author.
 */
export function rowProfiles(account: string, conversation: Conversation) {
  const { kind, lastMessage, members, name } = conversation;
  const others = members.filter((member) => member !== account);
  const titled =
    kind === "direct"
      ? [others[0] ?? account]
      : kind === "group" && name === null
        ? others
        : [];
  const author = lastMessage?.authorId;
  return author === undefined || author === account
    ? titled
    : [...titled, author];
}

/**
 * Whether the Inboxes can show the first time: some account's has loaded,
 * and every loaded one has all its rows (which come with its list).
 */
function inboxesReady(inboxes: readonly InboxSnapshot[]) {
  return (
    inboxes.some((inbox) => inbox.data !== undefined) &&
    inboxes.every((inbox) => inbox.complete || inbox.data === undefined)
  );
}

/**
 * Conversations across the visible accounts (or just `account`), newest
 * first: direct messages, groups, and the space channels shown in the
 * inbox. Each summary says which account it belongs to.
 *
 * It loads once: the first time, it waits for every name its rows show, so
 * rows never switch from usernames to names. (Every member's profile loads
 * too, for the conversations opened from it, but nothing waits on those.) After that it never goes back to
 * loading. A conversation that arrives later (someone starts one with
 * you) joins once its row's names have loaded, and a row already showing
 * stays put, so an update never empties or flashes the list.
 */
export function useInbox({ account }: { account?: string } = {}) {
  const visible = useVisibleAccounts();
  const accounts =
    account === undefined ? visible.map((item) => item.address) : [account];
  const inboxes = useInboxes(accounts);
  const conversations = inboxes.flatMap((inbox, index) =>
    (inbox.data ?? []).map((conversation) => {
      const owner = accounts[index] ?? "";
      return {
        account: owner,
        conversation,
        shows: rowProfiles(owner, conversation),
      };
    }),
  );
  const profiles = useProfileState(
    conversations.flatMap(({ conversation, shows }) => [
      // A channel's members are everyone in its space: they load when
      // someone starts typing in it (for @mentions), not for the Inbox.
      ...(conversation.kind === "channel" ? [] : conversation.members),
      ...shows,
    ]),
  );
  const rows = conversations.map((item) => ({
    ready: item.shows.every(profiles.isLoaded),
    summary: summarize(item.account, item.conversation, profiles.profileOf),
  }));
  // Order by the last message, matching the times shown on each row.
  rows.sort(
    (left, right) =>
      right.summary.lastActivityAt.getTime() -
      left.summary.lastActivityAt.getTime(),
  );
  // The rows shown so far, by key; null until the first load finishes.
  const [shown, setShown] = useState<ReadonlySet<string> | null>(null);
  const loading = !inboxesReady(inboxes) || !rows.every(({ ready }) => ready);
  const known =
    shown ?? (loading ? null : new Set(rows.map(({ summary }) => summary.key)));
  const arrived = rows
    .filter(({ ready, summary }) => ready && known?.has(summary.key) === false)
    .map(({ summary }) => summary.key);
  if (known !== null && (shown === null || arrived.length > 0)) {
    setShown(new Set([...known, ...arrived]));
  }
  if (known === null) return { conversations: undefined, isLoading: true };
  return {
    conversations: rows
      .filter(({ ready, summary }) => ready || known.has(summary.key))
      .map(({ summary }) => summary),
    isLoading: false,
  };
}
