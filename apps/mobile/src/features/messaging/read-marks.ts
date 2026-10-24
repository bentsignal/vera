import { useEffect, useRef } from "react";

// Marking a conversation or thread read while it's open. Every mark is a
// write the PDS answers by rerunning the reader's queries that show read
// state, so in a busy conversation it follows the newest message at most
// once every `MARK_READ_EVERY_MS`, always ending on the newest.

/** The least time between two marks. */
export const MARK_READ_EVERY_MS = 2000;

export interface MarkState {
  /** How far it was last marked read, and when. */
  readonly readAt: number;
  readonly markedAt: number;
}

/**
 * What to do now that the newest message is `newest`: mark it read
 * (`now`), wait until the time returned and ask again, or nothing.
 */
export function nextMark(state: MarkState, newest: number, now: number) {
  if (newest <= state.readAt) return undefined;
  const wakeAt = state.markedAt + MARK_READ_EVERY_MS;
  return now >= wakeAt ? ("now" as const) : wakeAt;
}

/**
 * Calls `mark` with the newest message's time as it changes, at most once
 * every `MARK_READ_EVERY_MS`, and once more on leaving if one is waiting.
 */
export function useMarkUpTo(
  newest: number | undefined,
  mark: (readAt: number) => void,
) {
  const state = useRef<MarkState>({ markedAt: 0, readAt: 0 });
  const waiting = useRef<number | undefined>(undefined);
  const markRef = useRef(mark);
  // eslint-disable-next-line no-restricted-syntax -- Read state lives on the server and must follow messages arriving while the screen is open, paced by a timer.
  useEffect(() => {
    markRef.current = mark;
    if (newest === undefined) return undefined;
    function markNow(readAt: number) {
      state.current = { markedAt: Date.now(), readAt };
      waiting.current = undefined;
      mark(readAt);
    }
    const next = nextMark(state.current, newest, Date.now());
    if (next === undefined) return undefined;
    const readAt = newest;
    if (next === "now") {
      markNow(readAt);
      return undefined;
    }
    waiting.current = readAt;
    const timer = setTimeout(
      () => markNow(readAt),
      Math.max(0, next - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [mark, newest]);
  // eslint-disable-next-line no-restricted-syntax -- Leaving with a mark still waiting sends it, so the last messages seen count as read.
  useEffect(
    () => () => {
      if (waiting.current !== undefined) markRef.current(waiting.current);
    },
    [],
  );
}
