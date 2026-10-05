import type { ConversationSummary } from "./types";
import type { InboxFrom, InboxShow } from "~/features/preferences/store";

function matches(
  conversation: ConversationSummary,
  show: InboxShow,
  from: InboxFrom,
) {
  if (show === "unread" && conversation.unreadCount === 0) return false;
  if (from === "everything") return true;
  if (from === "chats") return conversation.kind !== "channel";
  if (from === "channels") return conversation.kind === "channel";
  return conversation.spaceId === from;
}

/**
 * The conversations the filter keeps: pinned ones first, in the order they
 * were pinned, then the rest newest first (the order they arrive in).
 */
export function filterInbox(
  conversations: readonly ConversationSummary[],
  show: InboxShow,
  from: InboxFrom,
) {
  const kept = conversations.filter((conversation) =>
    matches(conversation, show, from),
  );
  const pinned = kept
    .filter((conversation) => conversation.pinnedAt !== null)
    .sort((left, right) => (left.pinnedAt ?? 0) - (right.pinnedAt ?? 0));
  return {
    pinned,
    rest: kept.filter((conversation) => conversation.pinnedAt === null),
  };
}
