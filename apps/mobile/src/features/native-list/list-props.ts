import type { Conversation } from "@decentralized-convex/messages";
import type { Ref } from "react";

import type { ThreadHead } from "~/features/conversation/build-rows";
import type { ComposerHeight } from "~/features/conversation/composer-height";
import type {
  ToggleReaction,
  ViewReactions,
} from "~/features/conversation/message-actions";
import type {
  MemberNotice,
  Message,
  MessageEdits,
  ProfileOf,
} from "~/features/conversation/types";
import type { MessageLayout } from "~/features/preferences/store";

// What a conversation or thread screen gives its list (`NativeMessageList`).

/** What the conversation screen can ask of its list. */
export interface MessageListHandle {
  /** Scrolls down to the newest message, as after sending one. */
  scrollToLatest: () => void;
}

export interface MessageListProps {
  messages: readonly Message[];
  /** A group's joins and leaves, shown between its messages. */
  notices?: readonly MemberNotice[];
  /** Set in a thread, whose original heads the list. */
  thread?: ThreadHead;
  self: string;
  layout: MessageLayout;
  profileOf: ProfileOf;
  showAuthors: boolean;
  /** A direct message's members, so anyone else there shows their name. */
  members?: readonly string[];
  /** The message it opens on, rather than the newest. */
  anchorId?: string;
  hasNewer: boolean;
  onLoadOlder: () => void;
  onLoadNewer: () => void;
  /** Space below the composer that the keyboard covers when it opens. */
  bottomInset: number;
  topInset: number;
  /** Height of the composer floating over the bottom of the list. */
  composerHeight: ComposerHeight;
  /** Who else is typing here, in the order they started. */
  typists: readonly string[];
  ref?: Ref<MessageListHandle>;
  onJumpToLatest: () => void;
  onToggleReaction: ToggleReaction;
  /** Opens the sheet of who reacted to a part, on one emoji if given. */
  onViewReactions: ViewReactions;
  /** A tap on a message opens its thread; absent in a thread. */
  onOpenThread?: (message: Message) => void;
  /** The menu's Reply; absent in a thread. */
  onReply?: (message: Message) => void;
  /** The menu's Edit and Delete, on your own messages (`useEditing`). */
  editing?: MessageEdits;
}

/**
 * Whose names a conversation's rows show (`showAuthors`, `members`):
 * everyone's but yours in a group or channel, and in a direct message
 * only anyone who isn't one of its two, such as an assistant one of them
 * @mentioned.
 */
export function authorsShownIn(
  conversation: Pick<Conversation, "kind" | "members"> | undefined,
) {
  return conversation?.kind === "direct"
    ? { members: conversation.members, showAuthors: false }
    : { showAuthors: true };
}
