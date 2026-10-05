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
  /** False until someone sends the first message. */
  hasMessages: boolean;
  lastActivityAt: Date;
  unreadCount: number;
  /** The other person's photo in a direct conversation. */
  avatarUrl: string | null;
  /** Whether the other person in a direct conversation is verified. */
  affiliated: boolean;
  muted: boolean;
  /** When it was pinned to the top of the inbox, or null. */
  pinnedAt: number | null;
  /** The space a channel belongs to. */
  spaceId: string | null;
  spaceName: string | null;
}
