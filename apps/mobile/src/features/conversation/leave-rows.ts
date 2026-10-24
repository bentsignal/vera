import { useState } from "react";

import type { MessageRow } from "./build-rows";
import type { Message } from "./types";

// A deleted message leaves the list rather than vanishing (see
// `Leave`): it fades, then its space closes as what was above it
// eases down. The messages around it keep their runs until it's gone. If
// the next one starts a run then, it needs room for its header (its name,
// say): the deleted message keeps that much as it closes, and gives it up
// in the same change that the next one takes it, so nothing moves. (One
// that joins the run above instead settles, see `Settle`.) Its time header
// goes with it when nothing else is under that header.

/**
 * The most messages that can leave at once. More gone at once is the list
 * moving to other messages, not a deletion.
 */
const MAX_RUN = 2;

/** A message on its way out. */
interface Leaving {
  readonly message: Message;
  /** Messages that left together close together (see `useClose`). */
  readonly batch: number;
  /** It has faded, and its rows are closing. */
  readonly closing: boolean;
}

/** How a row is leaving, if it is. */
export interface RowLeaving {
  readonly batch: number;
  /** It has faded, and its space is closing. */
  readonly closing: boolean;
  /** How much of its space it keeps for the next row's header. */
  readonly room: number;
}

function changed(before: readonly Message[], now: readonly Message[]) {
  return (
    before.length !== now.length ||
    before.some((message, index) => message !== now[index])
  );
}

/** Where the run of messages gone from `before` at `start` ends. */
function runEnd(
  before: readonly Message[],
  start: number,
  kept: ReadonlySet<string>,
) {
  let end = start;
  while (end < before.length && !kept.has(before[end]?.id ?? "")) end++;
  return end;
}

/**
 * Runs of messages gone from `before` with an older one still there, and
 * a newer one or none: deleted, not paged out of the list's window.
 */
function deleted(before: readonly Message[], now: readonly Message[]) {
  const kept = new Set(now.map((message) => message.id));
  const gone = new Array<Leaving>();
  let start = 0;
  while (start < before.length) {
    const end = runEnd(before, start, kept);
    if (end > start && start > 0 && end - start <= MAX_RUN) {
      const run = before.slice(start, end);
      // Named by its newest message's time, for `useClose`.
      const batch = run.at(-1)?.sentAt.getTime() ?? 0;
      for (const message of run) gone.push({ batch, closing: false, message });
    }
    start = Math.max(end, start + 1);
  }
  return gone;
}

/** `messages` with leaving ones back where they were, by time. */
function withLeaving(
  messages: readonly Message[],
  leaving: readonly Leaving[],
) {
  if (leaving.length === 0) return messages;
  const result = [...messages];
  for (const { message } of leaving) {
    const at = result.findIndex((other) => other.sentAt > message.sentAt);
    result.splice(at === -1 ? result.length : at, 0, message);
  }
  return result;
}

/** A row's message, or the message under a header. */
function messageIdOf(row: MessageRow) {
  if (row.type === "message") return row.key;
  if (row.type === "day" || row.type === "time") {
    return row.key.slice(row.type.length + 1);
  }
  return undefined;
}

/**
 * The rows leaving with their messages, by key, with their batch: rows
 * shown only because of one of `leaving`. A header that another takes
 * over (the next message's, at the same place) stays.
 */
function leavingRows(
  rows: readonly MessageRow[],
  without: readonly MessageRow[],
  leaving: readonly Leaving[],
) {
  const result = new Map<string, { row: MessageRow; batch: number }>();
  if (leaving.length === 0) return result;
  const batches = new Map(
    leaving.map(({ message, batch }) => [message.id, batch]),
  );
  const remaining = new Set(without.map((row) => row.key));
  const shown = new Set(rows.map((row) => row.key));
  const takenOver = without.some(
    (row) => (row.type === "day" || row.type === "time") && !shown.has(row.key),
  );
  for (const row of rows) {
    if (remaining.has(row.key)) continue;
    if (takenOver && row.type !== "message") continue;
    const id = messageIdOf(row);
    const batch = id === undefined ? undefined : batches.get(id);
    if (batch !== undefined) result.set(row.key, { batch, row });
  }
  return result;
}

/**
 * Room for the headers that grow once the leaving rows are gone (the
 * message after one starts a run now), by the leaving message row that
 * keeps it: the one just before it.
 */
function roomKept(
  rows: readonly MessageRow[],
  without: readonly MessageRow[],
  leaving: ReadonlyMap<string, unknown>,
  headerOf: (row: MessageRow) => number,
) {
  const after = new Map(without.map((row) => [row.key, row]));
  const room = new Map<string, number>();
  // Oldest first: the message row before each one.
  let before: string | undefined;
  for (const row of rows.toReversed()) {
    if (row.type !== "message") continue;
    const now = after.get(row.key);
    if (before !== undefined && now !== undefined) {
      const grows = headerOf(now) - headerOf(row);
      if (grows > 0) room.set(before, grows);
    }
    before = leaving.has(row.key) ? row.key : undefined;
  }
  return room;
}

/**
 * The list's rows, built by `build` from the messages, with deleted ones
 * kept until they've left. `leavingOf` tells how a row is leaving;
 * `faded` starts a batch closing, and `gone` drops it once it has closed.
 * `headerOf` is a row's header height (see `headerHeight`).
 */
export function useLeavingRows(
  messages: readonly Message[],
  build: (messages: readonly Message[]) => MessageRow[],
  headerOf: (row: MessageRow) => number,
) {
  const [seen, setSeen] = useState(messages);
  const [leaving, setLeaving] = useState<readonly Leaving[]>([]);
  if (changed(seen, messages)) {
    setSeen(messages);
    const back = new Set(messages.map((message) => message.id));
    const still = leaving.filter((item) => !back.has(item.message.id));
    const gone = deleted(seen, messages);
    if (gone.length > 0 || still.length !== leaving.length) {
      setLeaving([...still, ...gone]);
    }
  }
  const rows = build(withLeaving(messages, leaving));
  const left = leavingRows(
    rows,
    leaving.length > 0 ? build(messages) : rows,
    leaving,
  );
  const closing = new Set(
    leaving.filter((item) => item.closing).map((item) => item.batch),
  );
  const room =
    closing.size > 0
      ? roomKept(rows, build(messages), left, headerOf)
      : new Map<string, number>();
  // On their own, so each stays the same function from render to render:
  // every row takes them (see `Row`).
  function faded(batch: number) {
    setLeaving((now) =>
      now.map((item) =>
        item.batch === batch ? { ...item, closing: true } : item,
      ),
    );
  }
  function gone(batch: number) {
    setLeaving((now) => now.filter((item) => item.batch !== batch));
  }
  return {
    rows,
    leavingOf: (key: string): RowLeaving | undefined => {
      const batch = left.get(key)?.batch;
      if (batch === undefined) return undefined;
      return { batch, closing: closing.has(batch), room: room.get(key) ?? 0 };
    },
    faded,
    gone,
  };
}

export type LeavingRows = ReturnType<typeof useLeavingRows>;
