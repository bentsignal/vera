import type { MemberNotice, Message } from "./types";
import type { MessageLayout } from "~/features/preferences/store";
import { isSameDay } from "~/lib/format";

/** Bubbles get a time header after a pause this long, like iMessage. */
const HEADER_GAP_MS = 60 * 60 * 1000;
/** Stacked rows group an author's messages sent within this window. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export type MessageRow =
  /**
   * A header over the messages of a day (stacked) or after a pause
   * (bubbles). `opensThread` over a thread's original, with nothing above;
   * `author` is then the original's sender.
   */
  | {
      type: "day";
      key: string;
      date: Date;
      opensThread: boolean;
      author?: string;
    }
  | {
      type: "time";
      key: string;
      date: Date;
      opensThread: boolean;
      author?: string;
    }
  /** In a thread, between its original and the replies. */
  | { type: "replies"; key: string; date: Date; count: number }
  /** Someone joining or leaving a group. */
  | {
      type: "notice";
      key: string;
      notice: MemberNotice;
      /** Right under another notice, so it sits closer. */
      followsNotice: boolean;
    }
  | {
      type: "message";
      key: string;
      message: Message;
      /** First message of a run by the same author. */
      startsGroup: boolean;
      /** Last message of a run; bubbles draw their tail here. */
      endsGroup: boolean;
    };

/** What the list shows in order: messages, and notices between them. */
type Item =
  | { readonly type: "message"; readonly message: Message }
  | { readonly type: "notice"; readonly notice: MemberNotice };

function dateOf(item: Item) {
  return item.type === "message" ? item.message.sentAt : item.notice.at;
}

function messageOf(item: Item | undefined) {
  return item?.type === "message" ? item.message : undefined;
}

function needsHeader(
  layout: MessageLayout,
  previous: Item | undefined,
  item: Item,
) {
  if (previous === undefined) return true;
  const before = dateOf(previous);
  const date = dateOf(item);
  if (!isSameDay(before, date)) return true;
  return (
    layout === "bubbles" && date.getTime() - before.getTime() >= HEADER_GAP_MS
  );
}

function continues(
  layout: MessageLayout,
  previousItem: Item | undefined,
  nextItem: Item | undefined,
  rootId: string | undefined,
) {
  // A notice ends a run, and the message after it starts a new one.
  const previous = messageOf(previousItem);
  const next = messageOf(nextItem);
  if (previous === undefined || next === undefined) return false;
  if (previous.authorId !== next.authorId) return false;
  // A reply card stands on its own, and a thread's original stands apart
  // from its replies.
  if (previous.quote !== undefined || next.quote !== undefined) return false;
  if (previous.id === rootId) return false;
  if (needsHeader(layout, previousItem, { message: next, type: "message" })) {
    return false;
  }
  return (
    layout === "bubbles" ||
    next.sentAt.getTime() - previous.sentAt.getTime() < GROUP_WINDOW_MS
  );
}

type MessageRowOf = Extract<MessageRow, { type: "message" }>;
type HeaderRow = Extract<MessageRow, { type: "day" | "time" }>;

/**
 * Each message's rows from the last build, reused while they come out the
 * same, so the list only redraws rows that changed.
 */
const built = new WeakMap<
  Message,
  { readonly row: MessageRowOf; readonly header?: HeaderRow }
>();

function messageRow(
  message: Message,
  startsGroup: boolean,
  endsGroup: boolean,
) {
  const last = built.get(message)?.row;
  if (last?.startsGroup === startsGroup && last.endsGroup === endsGroup) {
    return last;
  }
  return {
    endsGroup,
    key: message.id,
    message,
    startsGroup,
    type: "message",
  } satisfies MessageRowOf;
}

function headerRow(
  message: Message,
  type: HeaderRow["type"],
  opensThread: boolean,
) {
  const last = built.get(message)?.header;
  if (last?.type === type && last.opensThread === opensThread) return last;
  return {
    author: opensThread ? message.authorId : undefined,
    date: message.sentAt,
    key: `${type}-${message.id}`,
    opensThread,
    type,
  };
}

/** Each notice's rows from the last build, like `built`. */
const builtNotices = new WeakMap<
  MemberNotice,
  { readonly row: NoticeRow; readonly header?: HeaderRow }
>();

type NoticeRow = Extract<MessageRow, { type: "notice" }>;

/** A notice's row, and the header above it when it needs one. */
function noticeRows(
  notice: MemberNotice,
  header: HeaderRow["type"] | null,
  followsNotice: boolean,
) {
  const last = builtNotices.get(notice);
  const row =
    last?.row.followsNotice === followsNotice
      ? last.row
      : ({
          followsNotice,
          key: notice.id,
          notice,
          type: "notice",
        } satisfies NoticeRow);
  if (header === null) {
    builtNotices.set(notice, { row });
    return [row];
  }
  const above =
    last?.header?.type === header
      ? last.header
      : {
          date: notice.at,
          key: `${header}-${notice.id}`,
          opensThread: false,
          type: header,
        };
  builtNotices.set(notice, { header: above, row });
  return [above, row];
}

/**
 * Messages and notices in one list, oldest first; a notice comes after
 * messages sent at the same moment.
 */
function timeline(
  messages: readonly Message[],
  notices: readonly MemberNotice[],
) {
  const items = messages.map((message): Item => ({ message, type: "message" }));
  if (notices.length === 0) return items;
  // Stable, and messages come first, so ties keep that order.
  return [
    ...items,
    ...notices.map((notice): Item => ({ notice, type: "notice" })),
  ].sort((left, right) => dateOf(left).getTime() - dateOf(right).getTime());
}

/** A thread's original, which its replies follow under a divider. */
export interface ThreadRoot {
  readonly id: string;
  /** How many replies the divider counts. */
  readonly count: number;
}

/** The divider under a thread's original. */
function dividerAfter(message: Message, root: ThreadRoot | undefined) {
  if (root?.id !== message.id) return [];
  return [
    {
      count: root.count,
      date: message.sentAt,
      key: "replies",
      type: "replies",
    } satisfies MessageRow,
  ];
}

/**
 * Interleaves headers with messages, oldest first: a time header after
 * each pause for bubbles, a day separator for stacked rows. In a thread,
 * the original comes first, then a divider counting its replies. A
 * group's notices sit between its messages, by time.
 */
export function buildMessageRows(
  messages: readonly Message[],
  layout: MessageLayout,
  root?: ThreadRoot,
  notices: readonly MemberNotice[] = [],
) {
  const items = timeline(messages, notices);
  const headerType = layout === "bubbles" ? "time" : "day";
  return items.flatMap((item, index): MessageRow[] => {
    const previous = items[index - 1];
    if (item.type === "notice") {
      const header = needsHeader(layout, previous, item);
      return noticeRows(
        item.notice,
        header ? headerType : null,
        !header && previous?.type === "notice",
      );
    }
    const { message } = item;
    const row = messageRow(
      message,
      !continues(layout, previous, item, root?.id),
      !continues(layout, item, items[index + 1], root?.id),
    );
    const divider = dividerAfter(message, root);
    if (!needsHeader(layout, previous, item)) {
      built.set(message, { row });
      return [row, ...divider];
    }
    const header = headerRow(message, headerType, message.id === root?.id);
    built.set(message, { header, row });
    return [header, row, ...divider];
  });
}

/** Whether a row came in after the conversation opened, at `openedAt`. */
export function arrivedAfter(row: MessageRow, openedAt: number) {
  if (row.type === "replies") return false;
  return dateOfRow(row).getTime() > openedAt;
}

function dateOfRow(row: Exclude<MessageRow, { type: "replies" }>) {
  if (row.type === "message") return row.message.sentAt;
  if (row.type === "notice") return row.notice.at;
  return row.date;
}

/**
 * Where a row sits in the list, oldest first, as a number a worklet can
 * compare: its message's time, or just before it for the header above it.
 */
export function rowOrder(date: Date, header = false) {
  return date.getTime() - (header ? 0.5 : 0);
}

/** Where a row sits in the list (see `rowOrder`). */
export function orderOfRow(row: MessageRow) {
  if (row.type === "message") return rowOrder(row.message.sentAt);
  if (row.type === "notice") return rowOrder(row.notice.at);
  // A thread's divider sits just after its original.
  if (row.type === "replies") return rowOrder(row.date) + 0.25;
  return rowOrder(row.date, true);
}

/**
 * Rows newest first, as the inverted list lays them out from the bottom.
 * A thread's original comes before its replies.
 */
export function newestFirst(
  messages: readonly Message[],
  layout: MessageLayout,
  thread: ThreadHead | undefined,
  notices: readonly MemberNotice[] = [],
) {
  if (thread === undefined) {
    return buildMessageRows(messages, layout, undefined, notices).reverse();
  }
  return buildMessageRows([thread.root, ...messages], layout, {
    count: thread.replyCount,
    id: thread.root.id,
  }).reverse();
}

/** In a thread: the message it answers, and how many replies it has. */
export interface ThreadHead {
  readonly root: Message;
  readonly replyCount: number;
}
