import { useEffect, useState } from "react";

import type { Message } from "./types";
import { GROW_MS } from "./moves";
import { onlyOthersArrived, sameMessages } from "./pace";

// How fast the list takes new messages from other people. Each one that
// arrives redraws the list and rises in over `GROW_MS`; in a busy
// conversation they came faster than that, each a separate redraw, and
// the list fell seconds behind. Now a message arriving during another's
// rise waits for it to finish, and the ones that waited rise in together.
// At a normal pace nothing waits: the first after a pause shows at once.

/** The least time between two redraws for others' new messages. */
export const PACE_MS = GROW_MS;

/**
 * `messages`, with others' new ones paced (see `onlyOthersArrived`). The
 * same array while they're the same messages, so the list redraws only
 * when what it shows changes.
 */
export function usePacedMessages(messages: readonly Message[], self: string) {
  const [shown, setShown] = useState(messages);
  // Others' messages are rising in (`rising`): more wait until they have.
  // Each rise has its own number, so one that starts in the render right
  // after another ends still gets its timer.
  const [rise, setRise] = useState({ count: 0, rising: false });
  if (!sameMessages(shown, messages)) {
    const others = onlyOthersArrived(shown, messages, self);
    // In this very render, so nothing lags at a normal pace.
    if (!others || !rise.rising) setShown(messages);
    if (others && !rise.rising) {
      setRise({ count: rise.count + 1, rising: true });
    }
  }
  const { count, rising } = rise;
  // eslint-disable-next-line no-restricted-syntax -- A rise finishing is a matter of time, which no data change marks.
  useEffect(() => {
    if (!rising) return undefined;
    const timer = setTimeout(
      () => setRise((current) => ({ count: current.count, rising: false })),
      PACE_MS,
    );
    return () => clearTimeout(timer);
  }, [count, rising]);
  return shown;
}
