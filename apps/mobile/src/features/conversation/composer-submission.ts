import type { Mention } from "@decentralized-convex/messages";

import type { useFieldGlass } from "./field-glass";
import type { SendCommitStore } from "./send-commit";
import type { EditSession } from "./use-editing";
import type { StagedFile } from "~/features/messaging/attachments";

/** The press remains synchronous: clear, enqueue, and identify the local row. */
export function composerSubmission(
  {
    canSend,
    edit,
    onSend,
  }: {
    canSend: boolean;
    edit: EditSession | undefined;
    onSend: (text: string, mentions: readonly Mention[]) => string;
  },
  written: {
    draft: string;
    clear: number;
    sent: (text: string) => Mention[];
    saved: (text: string) => Mention[];
  },
  commit: SendCommitStore,
  {
    settle,
    staged,
    begin,
  }: {
    settle: ReturnType<typeof useFieldGlass>["settle"];
    staged: readonly StagedFile[];
    begin: () => void;
  },
) {
  return () => {
    if (!canSend) return;
    begin();
    const sequence = settle(
      edit?.editing === undefined,
      written.clear + 1,
      staged.map((file) => file.id),
    );
    const text = written.draft.trim();
    try {
      if (edit?.editing === undefined) {
        const id = onSend(text, written.sent(text));
        if (sequence !== undefined) commit.expect(sequence, id);
      } else edit.save(text, written.saved(text));
    } catch (error) {
      if (sequence !== undefined) commit.cancel(sequence);
      throw error;
    }
  };
}
