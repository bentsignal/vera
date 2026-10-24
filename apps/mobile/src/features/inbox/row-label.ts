import type { ConversationSummary, ThreadSummaryRow } from "./types";
import { alertsIcon } from "~/features/messaging/alerts";
import { formatInboxTimestamp } from "~/lib/format";
import { replyCountLabel } from "./thread-links";

// What VoiceOver reads for an Inbox row on iOS. The row's look is React
// Native hosted inside a SwiftUI button and hidden from accessibility
// there (see `NativeRow`), so the button reads this instead.

function spoken(parts: readonly (string | null | undefined | false)[]) {
  return parts
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(", ");
}

/**
 * A conversation's row: its name, what's beside the name, unread, the
 * newest message, the account (`account`, when several show), and when.
 */
export function conversationLabel(
  conversation: ConversationSummary,
  account: string | null,
  now = new Date(),
) {
  const { unreadCount } = conversation;
  return spoken([
    conversation.title,
    conversation.spaceName,
    conversation.affiliated && "Verified",
    conversation.pinnedAt !== null && "Pinned",
    alertsIcon(conversation.alerts)?.label,
    unreadCount > 0 && `${unreadCount} unread`,
    conversation.lastMessage,
    account,
    formatInboxTimestamp(conversation.lastActivityAt, now),
  ]);
}

/**
 * A followed thread's row: whose thread and where, unread, the original,
 * its replies and the newest, the account, and when.
 */
export function threadLabel(
  thread: ThreadSummaryRow,
  account: string | null,
  now = new Date(),
) {
  const replies = replyCountLabel(thread.replyCount);
  return spoken([
    `${thread.rootAuthor.name}, thread in ${thread.conversationTitle}`,
    thread.unreadCount > 0 && `${thread.unreadCount} unread`,
    thread.rootText,
    thread.latestReply.length > 0
      ? `${replies}: ${thread.latestReply}`
      : replies,
    account,
    formatInboxTimestamp(thread.lastActivityAt, now),
  ]);
}
