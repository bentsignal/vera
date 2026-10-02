import type { Message } from "./types";
import type { MessageLayout } from "~/features/preferences/store";
import { isSameDay } from "~/lib/format";

/** Bubbles get a time header after a pause this long, like iMessage. */
const HEADER_GAP_MS = 60 * 60 * 1000;
/** Stacked rows group an author's messages sent within this window. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export type MessageRow =
  | { type: "day"; key: string; date: Date }
  | { type: "time"; key: string; date: Date }
  | {
      type: "message";
      key: string;
      message: Message;
      /** First message of a run by the same author. */
      startsGroup: boolean;
      /** Last message of a run; bubbles draw their tail here. */
      endsGroup: boolean;
      /** Your newest message, when nothing has come in after it. */
      delivered: boolean;
    };

function needsHeader(
  layout: MessageLayout,
  previous: Message | undefined,
  message: Message,
) {
  if (previous === undefined) return true;
  if (!isSameDay(previous.sentAt, message.sentAt)) return true;
  return (
    layout === "bubbles" &&
    message.sentAt.getTime() - previous.sentAt.getTime() >= HEADER_GAP_MS
  );
}

function continues(
  layout: MessageLayout,
  previous: Message | undefined,
  next: Message | undefined,
) {
  if (previous === undefined || next === undefined) return false;
  if (previous.authorId !== next.authorId) return false;
  if (needsHeader(layout, previous, next)) return false;
  return (
    layout === "bubbles" ||
    next.sentAt.getTime() - previous.sentAt.getTime() < GROUP_WINDOW_MS
  );
}

/**
 * Interleaves headers with messages, oldest first: a time header after
 * each pause for bubbles, a day separator for stacked rows.
 */
export function buildMessageRows(
  messages: readonly Message[],
  { layout, self }: { layout: MessageLayout; self: string },
) {
  return messages.flatMap((message, index): MessageRow[] => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const row = {
      delivered:
        next === undefined &&
        message.authorId === self &&
        message.status === undefined,
      endsGroup: !continues(layout, message, next),
      key: message.id,
      message,
      startsGroup: !continues(layout, previous, message),
      type: "message",
    } as const;
    if (!needsHeader(layout, previous, message)) return [row];
    const type = layout === "bubbles" ? "time" : "day";
    return [{ date: message.sentAt, key: `${type}-${message.id}`, type }, row];
  });
}
