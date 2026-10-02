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

/**
 * Interleaves day separators with messages and returns the rows newest
 * first, ready for an inverted list.
 */
export function buildMessageRows(messages: Message[]) {
  const sorted = [...messages].sort(
    (a, b) => a.sentAt.getTime() - b.sentAt.getTime(),
  );
  const rows = sorted.flatMap((message, index): MessageRow[] => {
    const previous = sorted[index - 1];
    const next = sorted[index + 1];
    const row = {
      type: "message",
      key: message.id,
      message,
      startsGroup: !continues(previous, message),
      endsGroup: !continues(message, next),
    } as const;
    if (previous && isSameDay(previous.sentAt, message.sentAt)) return [row];
    return [
      { type: "day", key: `day-${message.id}`, date: message.sentAt },
      row,
    ];
  });
  return rows.reverse();
}
