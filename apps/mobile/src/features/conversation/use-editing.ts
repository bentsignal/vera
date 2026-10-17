import type { Mention } from "@decentralized-convex/messages";
import type { RefObject } from "react";
import { useState } from "react";
import { Alert } from "react-native";

import type { ComposerHandle } from "./composer";
import type { Editing } from "./reply-bar";
import type { Message } from "./types";
import type { StagedFile } from "~/features/messaging/attachments";
import { useAccount } from "~/features/messaging/account";
import { useMessageEdits } from "~/features/messaging/edits";
import { quoteOf } from "~/features/messaging/messages";
import {
  draftKey,
  editDraftKey,
  saveDraftMentions,
  saveDraftText,
} from "./drafts";
import { quoteText } from "./reply-parts";

/** Whether there's something to send, or an edit to save. */
export function canSendNow(
  draft: string,
  staged: readonly StagedFile[],
  editing: Editing | undefined,
) {
  if (draft.trim().length > 0) return true;
  return editing === undefined ? staged.length > 0 : editing.canEmpty;
}

function sameMentions(
  left: readonly Mention[] | undefined,
  right: readonly Mention[],
) {
  const before = left ?? [];
  return (
    before.length === right.length &&
    before.every(
      (mention, index) =>
        mention.accountId === right[index]?.accountId &&
        mention.name === right[index].name,
    )
  );
}

/** What the composer takes from `useEditing` to edit a message. */
export type EditSession = Pick<
  ReturnType<typeof useEditing>,
  "cancel" | "editDraftKey" | "editing" | "save"
>;

/**
 * Editing and deleting your own messages from the menu. Edit puts the
 * message's text in the field ("Editing Message" over it), apart from the
 * draft, which comes back once it's saved or cancelled. Delete asks first,
 * since it deletes the message for everyone.
 */
export function useEditing({
  composer,
  conversationId,
  draftId,
}: {
  /** The field that takes the text being edited. */
  composer: RefObject<ComposerHandle | null>;
  conversationId: string;
  /**
   * Whose draft the field keeps: a thread's, or by default the
   * conversation's.
   */
  draftId?: string;
}) {
  const { address } = useAccount();
  const edits = useMessageEdits(conversationId);
  const key = editDraftKey(draftKey(address, draftId ?? conversationId));
  const [message, setMessage] = useState<Message>();

  function stop() {
    saveDraftText(key, "");
    saveDraftMentions(key, []);
    setMessage(undefined);
  }

  return {
    /** Set while the field edits a message. */
    editing:
      message === undefined
        ? undefined
        : ({
            canEmpty: message.attachments.length > 0,
            text: quoteText(quoteOf(message)),
          } satisfies Editing),
    /** The draft the field shows while editing. */
    editDraftKey: key,
    edit: (target: Message) => {
      saveDraftText(key, target.body ?? "");
      saveDraftMentions(key, target.mentions ?? []);
      setMessage(target);
      composer.current?.focus();
    },
    /** Leaves the message as it was. */
    cancel: stop,
    /** Saves the field's text as the message's, if it changed. */
    save: (text: string, mentions: readonly Mention[]) => {
      if (message === undefined) return;
      if (
        text !== (message.body ?? "") ||
        !sameMentions(message.mentions, mentions)
      ) {
        edits.edit(message.id, text, mentions);
      }
      stop();
    },
    delete: (target: Message) => {
      Alert.alert(
        "Delete Message?",
        "It will be deleted for everyone.",
        [
          { style: "cancel", text: "Cancel" },
          {
            onPress: () => {
              edits.delete(target.id);
              if (message?.id === target.id) stop();
            },
            style: "destructive",
            text: "Delete",
          },
        ],
        { cancelable: true },
      );
    },
  };
}
