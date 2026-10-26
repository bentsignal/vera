import type { ReactNode } from "react";
import { createContext, use, useState } from "react";

import type { MenuTarget } from "./glass-message-menu";
import type { Message, MessageEdits } from "./types";
import type { ReactionPart } from "~/features/messaging/reactions";
import { useAccount } from "~/features/messaging/account";
import { GlassMessageMenu } from "./glass-message-menu";
import { handlersFor } from "./menu-actions";

/** Adds or takes back your reaction on a part of a message. */
export type ToggleReaction = (
  messageId: string,
  emoji: string,
  part: ReactionPart,
) => void;

/** Opens who reacted to a part, on the given emoji's tab if there is one. */
export type ViewReactions = (
  messageId: string,
  part: ReactionPart,
  emoji?: string,
) => void;

interface MessageActions {
  readonly open: (target: MenuTarget) => void;
  /**
   * Opens a message's thread (a reply's own). Absent in a thread, where a
   * tap does nothing.
   */
  readonly openThread?: (message: Message) => void;
  readonly toggleReaction: ToggleReaction;
  readonly viewReactions: ViewReactions;
}

const MessageActionsContext = createContext<MessageActions | null>(null);

export function useMessageActions() {
  const actions = use(MessageActionsContext);
  if (actions === null) {
    throw new Error("Messages must render inside MessageActionsProvider");
  }
  return actions;
}

/**
 * Long-press actions for the messages below: the glass reaction overlay,
 * reaction toggles for the chips, the sheet of who reacted, and in a
 * conversation, replies and threads.
 */
export function MessageActionsProvider({
  onToggleReaction,
  onViewReactions,
  onOpenThread,
  onReply,
  editing,
  menuKeyboard,
  children,
}: {
  onToggleReaction: ToggleReaction;
  onViewReactions: ViewReactions;
  /** A tap on a message opens its thread; absent in a thread. */
  onOpenThread?: (message: Message) => void;
  /** The menu's Reply; absent in a thread. */
  onReply?: (message: Message) => void;
  /** The menu's Edit and Delete, on your own messages. */
  editing?: MessageEdits;
  /** What the keyboard does around the menu (see `useMenuKeyboardHold`). */
  menuKeyboard?: {
    onOpen: () => void;
    onClosing: () => void;
    onClosed: (backToChat: boolean) => void;
  };
  children: ReactNode;
}) {
  const { address } = useAccount();
  const [target, setTarget] = useState<MenuTarget | null>(null);
  return (
    <MessageActionsContext
      value={{
        open: (next) => {
          menuKeyboard?.onOpen();
          setTarget(next);
        },
        openThread: onOpenThread,
        toggleReaction: onToggleReaction,
        viewReactions: onViewReactions,
      }}
    >
      {children}
      {target !== null && (
        <GlassMessageMenu
          target={target}
          onReact={(emoji) =>
            onToggleReaction(target.message.id, emoji, target.part)
          }
          onViewReactions={(emoji) =>
            onViewReactions(target.message.id, target.part, emoji)
          }
          handlers={handlersFor(target.message, {
            editing,
            onReply,
            self: address,
          })}
          onClosing={menuKeyboard?.onClosing}
          onClosed={(backToChat) => {
            setTarget(null);
            menuKeyboard?.onClosed(backToChat);
          }}
        />
      )}
    </MessageActionsContext>
  );
}
