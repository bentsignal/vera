import { useEffect, useState } from "react";
import { useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { InsetState } from "./send-inset-state";
import type { ComposerHeight } from "~/features/conversation/composer-height";
import { heldMessages, rendered, waited, withHeight } from "./send-inset-state";

/**
 * How long a send waits for the composer's new height at most, so its
 * message never waits for good. It only waits when its field will get
 * shorter (`holdsForSend`), and the height reaches JavaScript a few frames
 * after the send's render. At this point it goes with the height on the UI
 * thread (`waited`). Known limit: if the composer hasn't got shorter even
 * there by then, its height goes in alone afterwards, up then down as
 * before this wait existed.
 */
const SEND_GUARD_MS = 500;

/**
 * The composer's height for the native list's `insets.bottom`, and the
 * messages it shows. Sending empties the field in the same render that
 * brings the message sent, and the composer's new height is only measured
 * after that render is on screen. Taken in two updates, the list rose by
 * the message, then dropped by the height the composer gave back. So a
 * send whose composer will get shorter keeps the messages newer than the
 * ones native has out of its rows until that height is measured
 * (`onSentShorter` or `onHeight`, whichever comes first), then gives
 * native both in one update, which it applies as one move (the contract's
 * `insets.bottom`). Every other change goes at once.
 */
export function useComposerInset<T extends { readonly id: string }>(
  { live, sent, sends, stepsUntil, laidOut }: ComposerHeight,
  messages: readonly T[],
) {
  const newest = messages.at(-1)?.id;
  const [state, setState] = useState<InsetState>({
    height: laidOut ?? 0,
    newest,
    pending: undefined,
    sends,
  });
  const next = rendered(state, { newest, sends });
  if (next !== state) setState(next);

  function onHeight(now: number) {
    const stepping = Date.now() < stepsUntil.get();
    setState((current) => withHeight(current, now, stepping));
  }
  useAnimatedReaction(
    () => live.get(),
    (now, before) => {
      if (before === null || now === before) return;
      if (sent.get()) sent.set(false);
      scheduleOnRN(onHeight, now);
    },
  );

  const waiting = next.pending?.sends;
  const known = next.pending?.known === true;
  // eslint-disable-next-line no-restricted-syntax -- A send's wait ends on a height report, but attachments still closing, or a height that never comes, are marked by no data change.
  useEffect(() => {
    if (waiting === undefined) return undefined;
    const delay = known
      ? Math.max(0, stepsUntil.get() - Date.now())
      : SEND_GUARD_MS;
    const timer = setTimeout(() => {
      const measured = live.get();
      setState((current) => waited(current, waiting, measured));
    }, delay);
    return () => clearTimeout(timer);
  }, [waiting, known, live, stepsUntil]);

  return { inset: next.height, messages: heldMessages(next, messages) };
}
