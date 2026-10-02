import type { Message } from "./types";
import { isSameDay } from "~/lib/format";

/** Consecutive messages within this window render as one group. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export type MessageRow =
  | { type: "day"; key: string; date: Date }
  | {
      type: "message";
      key: string;
      message: Message;
      /** First message of a run by the same author. */
      startsGroup: boolean;
      /** Last message of a run; shows the timestamp. */
      endsGroup: boolean;
    };

function continues(previous: Message | undefined, next: Message | undefined) {
  if (!previous || !next) return false;
  return (
    previous.authorId === next.authorId &&
    isSameDay(previous.sentAt, next.sentAt) &&
    next.sentAt.getTime() - previous.sentAt.getTime() < GROUP_WINDOW_MS
  );
}

/** Interleaves day separators with messages, oldest first. */
export function buildMessageRows(messages: readonly Message[]) {
  return messages.flatMap((message, index): MessageRow[] => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const row = {
      endsGroup: !continues(message, next),
      key: message.id,
      message,
      startsGroup: !continues(previous, message),
      type: "message",
    } as const;
    if (previous && isSameDay(previous.sentAt, message.sentAt)) return [row];
    return [
      { date: message.sentAt, key: `day-${message.id}`, type: "day" },
      row,
    ];
  });
}
