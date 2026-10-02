export type ConversationKind = "direct" | "group" | "channel";

export interface Person {
  id: string;
  displayName: string;
  /** Account address, such as `maya@vera.chat`. */
  address: string;
}

export interface ConversationSummary {
  /** The signed-in account this conversation belongs to. */
  account: string;
  id: string;
  /** Unique across accounts, which can share a conversation. */
  key: string;
  kind: ConversationKind;
  title: string;
  memberIds: string[];
  lastMessage: string;
  lastActivityAt: Date;
  unreadCount: number;
  /** The other person's photo in a direct conversation. */
  avatarUrl: string | null;
}
