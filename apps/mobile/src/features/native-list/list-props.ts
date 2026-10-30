import type { Ref } from "react";

import type { ThreadHead } from "~/features/conversation/build-rows";
import type { ComposerHeight } from "~/features/conversation/composer-height";
import type {
  ToggleReaction,
  ViewReactions,
} from "~/features/conversation/message-actions";
import type { ThreadLook } from "~/features/conversation/thread-looks";
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
  /** Development only: how a thread presents its original (thread-looks.ts). */
  threadLook?: {
    look: ThreadLook;
    /** The conversation's name. */
    title: string;
    /** The original shows as sent a day earlier, to try a day change. */
    yesterday: boolean;
    onOpenConversation: () => void;
  };
  self: string;
  layout: MessageLayout;
  profileOf: ProfileOf;
  showAuthors: boolean;
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
