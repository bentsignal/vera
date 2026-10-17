import type { MenuAction } from "./glass-menu-parts";
import type { MenuTarget } from "./glass-message-menu";
import type { Message, MessageEdits } from "./types";
import { reactionsOn } from "~/features/messaging/reactions";
import { canCopy, copyText, selectionTick } from "~/lib/native-extras";
import { linkActions } from "./link-actions";
import { canSaveToPhotos, saveToPhotos } from "./save-media";

/** The reactions on the part that was held. */
export function targetReactions(target: MenuTarget) {
  return reactionsOn(target.message.reactions, target.part);
}

/** What the menu's actions about the message itself do, where they show. */
export interface MessageHandlers {
  /** Reply, in a conversation (not a thread). */
  readonly onReply?: () => void;
  /** Edit and Delete, for your own messages. */
  readonly onEdit?: () => void;
  readonly onDelete?: () => void;
}

/**
 * The menu's Reply for `message`, and Edit and Delete when it's `self`'s.
 */
export function handlersFor(
  message: Message,
  {
    editing,
    onReply,
    self,
  }: {
    editing?: MessageEdits;
    onReply?: (message: Message) => void;
    self: string;
  },
) {
  const own = editing !== undefined && message.authorId === self;
  return {
    onDelete: own ? () => editing.delete(message) : undefined,
    onEdit: own ? () => editing.edit(message) : undefined,
    onReply: onReply === undefined ? undefined : () => onReply(message),
  } satisfies MessageHandlers;
}

/** Reply, in a conversation (not a thread). */
function replyAction(
  onReply: (() => void) | undefined,
  close: (then?: () => void, toChat?: boolean) => void,
) {
  if (onReply === undefined) return [];
  return [
    {
      icon: { android: "reply", ios: "arrowshape.turn.up.left" },
      label: "Reply",
      // Back to the conversation, where the field takes the reply (or on
      // into the thread, which brings its own keyboard).
      onPress: () => close(onReply, true),
    } satisfies MenuAction,
  ];
}

/** Edit and Delete, for your own messages; Delete goes last. */
function ownActions(
  { onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void },
  close: (then?: () => void, toChat?: boolean) => void,
) {
  const edit =
    onEdit === undefined
      ? []
      : [
          {
            icon: { android: "edit", ios: "pencil" },
            label: "Edit",
            // Back to the conversation, where the field takes the text.
            onPress: () => close(onEdit, true),
          } satisfies MenuAction,
        ];
  const remove =
    onDelete === undefined
      ? []
      : [
          {
            destructive: true,
            icon: { android: "delete", ios: "trash" },
            label: "Delete",
            onPress: () => close(onDelete),
          } satisfies MenuAction,
        ];
  return { edit, remove };
}

/**
 * Reply first (in a conversation), then a held link's actions, Save to
 * Photos for a held photo or video, Copy for text (the whole message,
 * links and all), Edit for your own, View Reactions once anyone has
 * reacted, and Delete, for your own, last.
 */
export function menuActions(
  target: MenuTarget,
  {
    close,
    onReply,
    onEdit,
    onDelete,
    onViewReactions,
  }: MessageHandlers & {
    /** Closes the menu, then runs `then`; `toChat` keeps the keyboard. */
    close: (then?: () => void, toChat?: boolean) => void;
    onViewReactions: () => void;
  },
) {
  const { attachment, link, message } = target;
  const { body } = message;
  const save =
    attachment !== undefined && canSaveToPhotos(attachment)
      ? [
          {
            icon: { android: "download", ios: "square.and.arrow.down" },
            label: "Save to Photos",
            onPress: () => {
              close();
              void saveToPhotos(attachment).then((saved) => {
                if (saved) selectionTick();
              });
            },
          } satisfies MenuAction,
        ]
      : [];
  const copy =
    canCopy && body !== undefined && body !== ""
      ? [
          {
            icon: { android: "content_copy", ios: "doc.on.doc" },
            // Beside Copy Link, say which copy this is.
            label: link === undefined ? "Copy" : "Copy Message",
            onPress: () => {
              copyText(body);
              close();
            },
          } satisfies MenuAction,
        ]
      : [];
  const viewReactions =
    targetReactions(target).length > 0
      ? [
          {
            icon: { android: "groups", ios: "person.2" },
            label: "View Reactions",
            onPress: () => close(onViewReactions),
          } satisfies MenuAction,
        ]
      : [];
  const own = ownActions({ onDelete, onEdit }, close);
  return [
    ...replyAction(onReply, close),
    ...linkActions(link, close),
    ...save,
    ...copy,
    ...own.edit,
    ...viewReactions,
    ...own.remove,
  ];
}
