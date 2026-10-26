import type {
  ActivityItem,
  Conversation,
  InboxKind,
  InboxThread,
} from "@decentralized-convex/messages";

/**
 * Whether a conversation is one the Inbox lists with these kinds ticked,
 * and alerts about its every message, so its unread messages badge Home.
 * One at Mentions or muted keeps its unread dot without counting; its
 * mentions and replies to you are in Activity.
 */
function countsConversation(
  conversation: Pick<Conversation, "alerts" | "kind" | "muted">,
  kinds: readonly InboxKind[],
) {
  const kind = conversation.kind === "channel" ? "channels" : "chats";
  // Servers from before alert levels only say whether it's muted.
  const alerts = conversation.alerts ?? (conversation.muted ? "none" : "all");
  return kinds.includes(kind) && alerts === "all";
}

/**
 * Home's badge: every unread message in the direct messages and groups
 * the Inbox lists, one for each such channel with anything unread, and
 * (with threads listed) one for each thread with unread replies, whether
 * it shows all of them or only unread ones. Only conversations that alert
 * about everything count; one at Mentions or muted keeps its unread dot
 * without counting.
 */
export function homeCount({
  conversations,
  kinds,
  threads,
}: {
  conversations: readonly Pick<
    Conversation,
    "alerts" | "kind" | "muted" | "unreadCount"
  >[];
  kinds: readonly InboxKind[];
  threads: readonly Pick<InboxThread, "unreadCount">[];
}) {
  const chats = conversations
    .filter((conversation) => countsConversation(conversation, kinds))
    .reduce(
      (sum, { kind, unreadCount }) =>
        sum + (kind === "channel" ? Math.min(unreadCount, 1) : unreadCount),
      0,
    );
  const replies = kinds.includes("threads")
    ? threads.filter((thread) => thread.unreadCount > 0).length
    : 0;
  return chats + replies;
}

/**
 * The direct messages and groups whose every unread message Home counts:
 * a mention of you or reply to you in one of them is among those, so
 * Activity's item for it doesn't count again (see `countsOnItsOwn`).
 */
export function countedChats(
  conversations: readonly Pick<
    Conversation,
    "alerts" | "conversationId" | "kind" | "muted"
  >[],
  kinds: readonly InboxKind[],
) {
  return new Set(
    conversations
      .filter(
        (conversation) =>
          conversation.kind !== "channel" &&
          countsConversation(conversation, kinds),
      )
      .map(({ conversationId }) => conversationId),
  );
}

/**
 * Whether an Activity item counts in the app's badge on its own: not a
 * mention or reply in a conversation Home counts message by message
 * (reading the conversation sees it, so while it's unseen, it's one of
 * the conversation's unread messages), unless it's kept in a thread.
 */
export function countsOnItsOwn(
  item: {
    readonly conversation: { readonly conversationId: string };
    readonly kind: ActivityItem["kind"];
    readonly message?: { readonly threadOnly?: boolean };
  },
  counted: ReadonlySet<string>,
) {
  if (item.kind !== "mention" && item.kind !== "reply") return true;
  return (
    item.message?.threadOnly === true ||
    !counted.has(item.conversation.conversationId)
  );
}
