export type ConversationKind = "direct" | "group" | "channel";

export interface Person {
  id: string;
  displayName: string;
  /** Account address, such as `maya@vera.chat`. */
  address: string;
}

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  title: string;
  memberIds: string[];
  lastMessage: string;
  lastActivityAt: Date;
  unreadCount: number;
  /** The other person's photo in a direct conversation. */
  avatarUrl: string | null;
  /** Stable avatar color seed. */
  avatarSeed: string;
}
