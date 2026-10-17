import type { ReplyingTo } from "./reply-bar";
import type { EditSession } from "./use-editing";
import type { StagedFile } from "~/features/messaging/attachments";
import { EditBar, ReplyBar } from "./reply-bar";
import { StagedAttachments } from "./staged-attachments";

// The top of the message field, over its text.

/**
 * What sits over the text in the field: what it's editing or replying to,
 * and the attachments picked for the message (an edit has none).
 */
export function FieldTop({
  edit,
  replyingTo,
  onCancelReply,
  staged,
  onRemoveStaged,
}: {
  edit: EditSession | undefined;
  replyingTo: ReplyingTo | undefined;
  onCancelReply: () => void;
  staged: readonly StagedFile[];
  onRemoveStaged: (id: string) => void;
}) {
  if (edit?.editing !== undefined) {
    return <EditBar editing={edit.editing} onCancel={edit.cancel} />;
  }
  return (
    <>
      {replyingTo !== undefined && (
        <ReplyBar replyingTo={replyingTo} onCancel={onCancelReply} />
      )}
      <StagedAttachments files={staged} onRemove={onRemoveStaged} />
    </>
  );
}
