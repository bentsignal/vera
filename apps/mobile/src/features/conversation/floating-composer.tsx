import type { Ref } from "react";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";

import type { ComposerHandle } from "./composer";
import type { MentionCandidate } from "./mention-text";
import type { ReplyingTo } from "./reply-bar";
import type { EditSession } from "./use-editing";
import type {
  AttachmentSource,
  StagedFile,
} from "~/features/messaging/attachments";
import type { OutgoingDraft } from "~/features/messaging/outbox";
import type { PastedImage } from "~/lib/paste-images";
import { useAccount } from "~/features/messaging/account";
import {
  MAX_ATTACHMENTS,
  pickAttachments,
  stagePasted,
} from "~/features/messaging/attachments";
import { useLinkPrefetch } from "~/features/messaging/link-previews";
import { Composer, useComposerBottomInset } from "./composer";
import {
  discardStaged,
  draftKey,
  keepForDraft,
  readDraft,
  saveDraftFiles,
} from "./drafts";

/**
 * The composer floating over the bottom of a conversation or thread,
 * holding what's picked for the next message until it's sent, in its draft
 * on this device. Reports its height so messages can scroll under it.
 */
export function FloatingComposer({
  ref,
  draftId,
  mentionable,
  onHeight,
  onSend,
  replyingTo,
  onCancelReply,
  edit,
  placeholder,
}: {
  ref?: Ref<ComposerHandle>;
  /** Whose draft it keeps: the conversation's, or a thread's. */
  draftId: string;
  /** Who can be @mentioned (see `Composer`). */
  mentionable?: readonly MentionCandidate[];
  /** The bar's height, without the people to mention listed over it. */
  onHeight: (height: number) => void;
  onSend: (draft: OutgoingDraft) => void;
  /** Set while the next message is a reply (see `Composer`). */
  replyingTo?: ReplyingTo;
  onCancelReply?: () => void;
  /** Editing a message of yours (see `Composer`). */
  edit?: EditSession;
  placeholder?: string;
}) {
  const bottomInset = useComposerBottomInset();
  const { address } = useAccount();
  const key = draftKey(address, draftId);
  const links = useLinkPrefetch();
  const [staged, setStaged] = useState(() => readDraft(key).files);
  // One picker at a time: a second tap on the menu while one is still
  // handing over files does nothing.
  const picking = useRef(false);

  function full() {
    if (staged.length < MAX_ATTACHMENTS) return false;
    Alert.alert(
      "Too Many Attachments",
      `You can send up to ${MAX_ATTACHMENTS} at a time.`,
    );
    return true;
  }

  /**
   * Changes the staged files and saves them in the draft. Starts from the
   * draft's, which are current even after awaiting a picker.
   */
  function restage(
    change: (current: readonly StagedFile[]) => readonly StagedFile[],
  ) {
    const next = change(readDraft(key).files);
    saveDraftFiles(key, next);
    setStaged(next);
  }

  function add(files: readonly StagedFile[]) {
    restage((current) =>
      [...current, ...keepForDraft(files)].slice(0, MAX_ATTACHMENTS),
    );
  }

  async function pick(source: AttachmentSource) {
    if (picking.current || full()) return;
    // Nothing shows in the composer until the files are ready; then they
    // animate in.
    picking.current = true;
    const files = await pickAttachments(source, {
      limit: MAX_ATTACHMENTS - staged.length,
    }).finally(() => {
      picking.current = false;
    });
    add(files);
  }

  function paste(images: readonly PastedImage[]) {
    if (full()) return;
    add(stagePasted(images, MAX_ATTACHMENTS - staged.length));
  }

  return (
    <KeyboardStickyView
      // With the keyboard up, the inset below the bar goes behind it.
      offset={{ closed: 0, opened: bottomInset }}
      // Floats over the messages, which scroll all the way to the bottom.
      style={{ bottom: 0, left: 0, position: "absolute", right: 0 }}
    >
      <Composer
        ref={ref}
        draftKey={key}
        bottomInset={bottomInset}
        staged={staged}
        mentionable={mentionable}
        onHeight={onHeight}
        replyingTo={replyingTo}
        onCancelReply={onCancelReply}
        edit={edit}
        placeholder={placeholder}
        onChangeText={links.onChangeText}
        onPick={(source) => void pick(source)}
        onPaste={paste}
        onRemoveStaged={(id) => {
          const removed = staged.find((file) => file.id === id);
          if (removed !== undefined) discardStaged(removed);
          restage((current) => current.filter((file) => file.id !== id));
        }}
        onSend={(body, mentions) => {
          onSend({
            body,
            files: staged,
            linkPreviews: links.cardsFor(body),
            mentions,
          });
          // The outbox uploads the files from where they are; the drafts
          // folder clears them out next launch.
          restage(() => []);
        }}
      />
    </KeyboardStickyView>
  );
}
