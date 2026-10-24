import type { MessageRow } from "../conversation/build-rows.ts";
import type { Newest } from "../conversation/typing-change.ts";

// Someone who stops typing stays in the typing row a moment, until their
// message arrives (see `holdTypists`), so the native list can grow it out
// of their typing bubble.

/** How long someone who stopped typing stays, waiting for their message. */
export const TYPING_HOLD_MS = 1000;

/** Who the typing row shows, and who of them has stopped. */
export interface TypingHold {
  readonly shown: readonly string[];
  /** Stopped typing with no message from them yet. */
  readonly leaving: readonly string[];
  /** The newest row when this was worked out, to tell a new one. */
  readonly newestKey: string | undefined;
}

export const NO_TYPING = {
  leaving: [],
  newestKey: undefined,
  shown: [],
} satisfies TypingHold;

/**
 * How many of the newest rows `holdTypists` looks through for messages
 * that just arrived: more than ever land in one update while people type.
 */
const RECENT_ROWS = 20;

/** The newest rows, newest first, as `holdTypists` takes them. */
export function recentOf(rows: readonly MessageRow[]) {
  return rows.slice(0, RECENT_ROWS).map((row) => ({
    authorId: row.type === "message" ? row.message.authorId : undefined,
    key: row.key,
  })) satisfies Newest[];
}

/**
 * Who sent the rows newer than `newestKey` (the newest row last time),
 * from `recent`, newest first. If that row isn't among them (more arrived
 * at once than `recent` holds), every one of them counts.
 */
function arrivedSince(
  recent: readonly Newest[],
  newestKey: string | undefined,
) {
  const seen = recent.findIndex((row) => row.key === newestKey);
  return new Set(
    (seen === -1 ? recent : recent.slice(0, seen)).flatMap((row) =>
      row.authorId === undefined ? [] : [row.authorId],
    ),
  );
}

/**
 * Who the typing row shows now that `typists` are typing and `recent` are
 * the newest rows (newest first, see `recentOf`). Both native lists grow a
 * message out of its author's typing bubble only when the typing row goes
 * in the same update as the message arrives. The typing query can say
 * someone stopped before the message they sent shows up, so they stay
 * (`leaving`) until it does, or until `dropLeaving` lets them go. Everyone
 * whose message arrived since last time goes with it, several at once if
 * their messages came in together, and anyone typing again just stays.
 */
export function holdTypists(
  hold: TypingHold,
  typists: readonly string[],
  recent: readonly Newest[],
) {
  const newestKey = recent[0]?.key;
  const arrived =
    newestKey === hold.newestKey
      ? new Set<string>()
      : arrivedSince(recent, hold.newestKey);
  const typing = new Set(typists);
  const shown = new Set(hold.shown);
  const stopped = hold.shown.filter(
    (address) => !typing.has(address) && !arrived.has(address),
  );
  const waiting = new Set(stopped);
  return {
    leaving: stopped,
    newestKey,
    shown: [
      ...hold.shown.filter(
        (address) => typing.has(address) || waiting.has(address),
      ),
      ...typists.filter((address) => !shown.has(address)),
    ],
  } satisfies TypingHold;
}

/** Lets `expired` go if they've still sent nothing and aren't typing. */
export function dropLeaving(hold: TypingHold, expired: readonly string[]) {
  const due = new Set(expired);
  const gone = new Set(hold.leaving.filter((address) => due.has(address)));
  if (gone.size === 0) return hold;
  return {
    ...hold,
    leaving: hold.leaving.filter((address) => !gone.has(address)),
    shown: hold.shown.filter((address) => !gone.has(address)),
  } satisfies TypingHold;
}

/** Whether `next` shows anything different from `hold`. */
export function sameHold(hold: TypingHold, next: TypingHold) {
  return (
    hold.newestKey === next.newestKey &&
    hold.shown.join() === next.shown.join() &&
    hold.leaving.join() === next.leaving.join()
  );
}

/**
 * Who to start and stop timing as `leaving` changes, given who's timed
 * (`running`): one per person, from when they stop typing, so someone
 * else stopping later doesn't keep them longer than `TYPING_HOLD_MS`.
 */
export function timerChanges(
  running: Iterable<string>,
  leaving: readonly string[],
) {
  const started = new Set(running);
  const now = new Set(leaving);
  return {
    start: leaving.filter((address) => !started.has(address)),
    stop: [...started].filter((address) => !now.has(address)),
  };
}

/** How much of someone's hold is left at `now`, if they stopped at `at`. */
export function holdLeftMs(at: number, now: number) {
  return Math.max(0, at + TYPING_HOLD_MS - now);
}

/** Who of those timed (`stopped`, by when) stopped by `at`, so are due. */
export function dueBy(stopped: ReadonlyMap<string, number>, at: number) {
  return [...stopped].flatMap(([address, since]) =>
    since <= at ? [address] : [],
  );
}
