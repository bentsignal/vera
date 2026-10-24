import { useState } from "react";
import { useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { Row } from "./contract";
import type { InsetState } from "./send-inset-state";
import type { ComposerHeight } from "~/features/conversation/composer-height";
import { changed, expired, insetOf, sentShorter } from "./send-inset-state";

/**
 * How long a send's shorter composer waits for the message sent (#257's
 * 20 frames): one that went in off screen never moves anything for it.
 */
const SEND_WAIT_MS = 333;

/**
 * The composer's height for the native list's `insets.bottom`. Sending
 * makes the composer shorter one render before the message sent is in the
 * rows (`onSentShorter`, #257). Taken at once, the list dropped by the
 * height given back and then rose as the message came in. So after a send
 * it keeps the old height until the render that brings the message (the
 * newest row changes), and the new height goes to native in the same
 * update as those rows, which applies both as one move (the contract's
 * `insets.bottom`). Every other change goes at once, as a new line does.
 */
export function useComposerInset(
  { live, sent, laidOut }: ComposerHeight,
  rows: readonly Row[],
) {
  // The newest row, typing aside: the message sent replaces it.
  const newest = rows.find((row) => row.kind !== "typing")?.id;
  const [state, setState] = useState<InsetState>({
    height: laidOut ?? 0,
    held: undefined,
  });
  function onSentShorter(before: number, now: number) {
    const hold = { height: before, newest };
    setState((current) => sentShorter(current, now, hold));
    // A later send's hold isn't this one's to drop.
    setTimeout(() => {
      setState((current) => expired(current, hold));
    }, SEND_WAIT_MS);
  }
  function onChanged(now: number) {
    setState((current) => changed(current, now));
  }
  useAnimatedReaction(
    () => live.get(),
    (now, before) => {
      if (before === null || now === before) return;
      if (now < before && sent.get()) {
        sent.set(false);
        scheduleOnRN(onSentShorter, before, now);
      } else {
        scheduleOnRN(onChanged, now);
      }
    },
  );
  // Released in the render where the message sent is the newest row.
  return insetOf(state, newest);
}
