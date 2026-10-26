import type { Mention } from "@decentralized-convex/messages";
import type { Ref } from "react";

import type { ComposerHandle } from "./composer";
import type { ComposerReport } from "./composer-height";
import type { MentionCandidate } from "./mention-text";
import type { ReplyingTo } from "./reply-bar";
import type { EditSession } from "./use-editing";
import type {
  AttachmentSource,
  StagedFile,
} from "~/features/messaging/attachments";
import type { PastedImage } from "~/lib/paste-images";

export interface ComposerProps {
  ref?: Ref<ComposerHandle>;
  /** From `draftKey`: the account and conversation the draft belongs to. */
  draftKey: string;
  staged: readonly StagedFile[];
  /** Who can be @mentioned; undefined where nobody can. */
  mentionable?: readonly MentionCandidate[];
  /** Sends the text (possibly empty) and who it mentions, with everything staged. */
  onSend: (text: string, mentions: readonly Mention[]) => string;
  onPick: (source: AttachmentSource) => void;
  /** Photos pasted into the field. */
  onPaste: (images: readonly PastedImage[]) => void;
  onRemoveStaged: (id: string) => void;
  /**
   * Every change to the text, including emptying it on send (`sent`).
   * See `reportedChanges` for edits.
   */
  onChangeText?: (text: string, sent: boolean) => void;
  /** Its height, for the list (see `useComposerHeight`). */
  report: ComposerReport;
  /** From `useComposerBottomInset`. */
  bottomInset: number;
  /** Set while the next message is a reply. */
  replyingTo?: ReplyingTo;
  onCancelReply?: () => void;
  /**
   * Editing a message of yours (see `useEditing`): while it's `editing`,
   * the field shows its text instead of the draft, with no attachments.
   */
  edit?: EditSession;
  placeholder?: string;
}
