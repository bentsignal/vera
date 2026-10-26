import { useEffect } from "react";
import { useIsFocused } from "expo-router";

import type { Message } from "~/features/conversation/types";
import type { OutgoingDraft } from "~/features/messaging/outbox";
import type { ReactionPart } from "~/features/messaging/reactions";
import { env } from "~/env";
import { useMessageEdits } from "~/features/messaging/edits";
import { attachmentPart } from "~/features/messaging/reactions";
import { useDevTools } from "./dev-tools";

/** What scripts can do in the open conversation (see `useDevConversation`). */
interface DevConversation {
  /** The conversation's ID, to open one of its threads. */
  id: string;
  /** Loaded messages, for checking real media, links, and anchor routes. */
  messages: () => readonly Message[];
  /**
   * Adds or takes back your `emoji` on the newest message reading `text`,
   * or on its attachment at `attachment`.
   */
  react: (text: string, emoji: string, attachment?: number) => void;
  send: (text: string) => void;
  /** Sends `text`, and has the bots answer it. */
  ask: (text: string) => void;
  /** Edits your newest message reading `text` to read `to`. */
  edit: (text: string, to: string) => void;
  /** Deletes your newest message reading `text`. */
  remove: (text: string) => void;
  /** The newest message reading `text`, by ID (to open its thread). */
  idOf: (text: string) => string;
}

let open: DevConversation | undefined;

/** The open conversation, for `globalThis.veraDev.conversation()`. */
export function devConversation() {
  return open;
}

/**
 * Debug builds on a dev PDS only: lets scripts react and send in the open
 * conversation without tapping. The simulator's tap automation stalls the
 * app for a moment as it reads the screen, which would hide the frames that
 * `scripts/sim.sh frames` is measuring.
 */
export function useDevConversation(
  conversationId: string,
  {
    messages,
    toggleReaction,
    sendMessage,
  }: {
    messages: readonly Message[];
    toggleReaction: (
      messageId: string,
      emoji: string,
      part: ReactionPart,
    ) => void;
    sendMessage: (draft: OutgoingDraft) => void;
  },
  /** In a thread: the bots answer `ask` there. */
  threadId?: string,
) {
  const edits = useMessageEdits(conversationId);
  const devTools = useDevTools();
  // A thread opens over its conversation, which stays mounted: the one on
  // top is the open one.
  const focused = useIsFocused();
  // eslint-disable-next-line no-restricted-syntax -- Hands the open conversation to dev scripts, which run outside React; debug builds only.
  useEffect(() => {
    if ((!__DEV__ && !env.profileBundle) || !env.devTools || !focused) return;
    function find(text: string) {
      const message = messages.findLast((item) => item.body === text);
      if (message === undefined) throw new Error(`No message "${text}"`);
      return message;
    }
    open = {
      id: conversationId,
      messages: () => messages,
      edit: (text, to) => edits.edit(find(text).id, to, []),
      remove: (text) => edits.delete(find(text).id),
      idOf: (text) => find(text).id,
      react: (text, emoji, attachment) => {
        const message = find(text);
        const part =
          attachment === undefined
            ? "message"
            : attachmentPart(message, attachment);
        toggleReaction(message.id, emoji, part);
      },
      send: (body) =>
        sendMessage({ body, files: [], linkPreviews: [], mentions: [] }),
      ask: (body) => {
        sendMessage({ body, files: [], linkPreviews: [], mentions: [] });
        devTools.replyToMe(conversationId, threadId);
      },
    };
    return () => {
      open = undefined;
    };
  });
}
