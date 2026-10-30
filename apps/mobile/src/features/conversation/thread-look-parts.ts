import type {
  HeaderRow,
  MessageRow,
  Person,
  Row,
} from "../native-list/contract.ts";
import {
  formatDaySeparator,
  formatMessageTime,
  formatTime,
  formatTimeHeader,
  isSameDay,
} from "../../lib/format.ts";

// Development only: the pieces the thread looks (thread-looks.ts) are made
// of, working on a thread's rows oldest first.

/** The divider under the original (`dividerAfter` in build-rows.ts). */
const DIVIDER_ID = "replies";

/** What the looks need besides the rows. */
export interface LookContext {
  readonly rootId: string;
  readonly replyCount: number;
  /** The conversation's name ("#general"). */
  readonly title: string;
  /** Whether this binary draws React rows in the list (`MessageListRow`). */
  readonly customRows: boolean;
  readonly now?: Date;
}

/** The custom rows' components, which thread-look-rows.tsx draws. */
export type LookRowProps =
  | {
      readonly component: "lookTitle";
      readonly author: Person;
      readonly when: string;
      readonly where: string;
    }
  | {
      readonly component: "lookPost";
      readonly when: string;
      readonly replies: number;
      readonly people: number;
    }
  | {
      readonly component: "lookSection";
      readonly label: string;
      readonly day?: string;
    }
  | { readonly component: "lookDay"; readonly label: string }
  | {
      readonly component: "lookComments";
      readonly replies: number;
      readonly people: readonly Person[];
    }
  | {
      readonly component: "lookOrigin";
      readonly where: string;
      readonly when: string;
    };

export function customRow(
  id: string,
  props: LookRowProps,
  fallbackText: string,
) {
  return {
    component: props.component,
    fallbackText,
    id,
    kind: "custom",
    props,
  } satisfies Row;
}

export function isMessage(row: Row | undefined): row is MessageRow {
  return row?.kind === "message";
}

export function isDayHeader(row: Row | undefined): row is HeaderRow {
  return row?.kind === "header" && row.id !== DIVIDER_ID;
}

export function repliesLabel(count: number) {
  if (count === 0) return "No replies yet";
  return count === 1 ? "1 reply" : `${count} replies`;
}

/** "Yesterday at 9:15 PM". */
export function whenLabel(sentAt: number, now: Date | undefined) {
  const { day, time } = formatTimeHeader(new Date(sentAt), now);
  return `${day} at ${time}`;
}

const POST_DATE = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  weekday: "short",
  year: "numeric",
});

/** "9:15 PM · Wed, Oct 28, 2026", as a post's detail shows it. */
export function postWhen(sentAt: number) {
  const date = new Date(sentAt);
  return `${formatTime(date)} · ${POST_DATE.format(date)}`;
}

/** The rows oldest first, split around the original. */
export interface Parts {
  readonly root: MessageRow;
  /** The divider under the original, if the list has it. */
  readonly divider: HeaderRow | undefined;
  /** Everything after the divider, oldest first. */
  readonly replies: readonly Row[];
}

export function partsOf(newestFirst: readonly Row[], rootId: string) {
  const rows = [...newestFirst].reverse();
  const rootIndex = rows.findIndex((row) => row.id === rootId);
  const root = rows[rootIndex];
  if (!isMessage(root)) return null;
  const next = rows[rootIndex + 1];
  const divider =
    next?.kind === "header" && next.id === DIVIDER_ID ? next : undefined;
  const replies = rows.slice(rootIndex + (divider === undefined ? 1 : 2));
  return { divider, replies, root } satisfies Parts;
}

function firstReply(replies: readonly Row[]) {
  return replies.find(isMessage);
}

/**
 * Drops the day header right under the divider, and the day it named if
 * it isn't the original's ("Today"), for the divider to carry.
 */
export function foldFirstDay(parts: Parts, now: Date | undefined) {
  const [first, ...rest] = parts.replies;
  if (!isDayHeader(first)) return { day: undefined, replies: parts.replies };
  const reply = firstReply(rest);
  const sameDay =
    reply === undefined ||
    isSameDay(new Date(reply.sentAt), new Date(parts.root.sentAt));
  return {
    day:
      reply === undefined || sameDay
        ? undefined
        : formatDaySeparator(new Date(reply.sentAt), now),
    replies: rest,
  };
}

/**
 * The replies with no day headers. Each message's own time says the day
 * instead: stacked rows already do; bubbles' revealed times get it too.
 */
export function withoutDays(replies: readonly Row[], now: Date | undefined) {
  return replies
    .filter((row) => !isDayHeader(row))
    .map((row) => {
      if (!isMessage(row) || row.layout !== "bubbles") return row;
      return {
        ...row,
        timeLabel: formatMessageTime(new Date(row.sentAt), now),
      } satisfies MessageRow;
    });
}

/** A stacked original's header without its time, which a look shows. */
export function untimed(root: MessageRow) {
  return root.layout === "stacked" ? { ...root, timeLabel: "" } : root;
}

export function divider(
  parts: Parts,
  label: string,
  style: HeaderRow["style"],
) {
  if (parts.divider === undefined) return [];
  return [
    { ...parts.divider, fallbackText: label, label, style },
  ] satisfies Row[];
}

/** Who replied, in the order they first did. */
export function repliers(replies: readonly Row[]) {
  const people = new Map<string, Person>();
  for (const row of replies) {
    if (isMessage(row) && !people.has(row.author.id)) {
      people.set(row.author.id, row.author);
    }
  }
  return [...people.values()];
}

export function merged(
  parts: Parts,
  context: LookContext,
  style: HeaderRow["style"],
) {
  const { day, replies } = foldFirstDay(parts, context.now);
  const count = repliesLabel(context.replyCount);
  return [
    parts.root,
    ...divider(parts, day === undefined ? count : `${count} · ${day}`, style),
    ...replies,
  ];
}

/** Left-aligned day subheads among the replies (`section`). */
export function daySubheads(replies: readonly Row[]) {
  return replies.map((row) =>
    isDayHeader(row)
      ? customRow(
          `look-${row.id}`,
          { component: "lookDay", label: row.label },
          row.label,
        )
      : row,
  );
}
