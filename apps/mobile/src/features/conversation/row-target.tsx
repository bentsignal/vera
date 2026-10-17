import type { ReactNode } from "react";
import type { GestureResponderEvent } from "react-native";
import { useId } from "react";
import { Pressable } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import type { MenuPress } from "./row-touch";
import type { Message } from "./types";
import { impact } from "~/lib/native-extras";
import { wasLinkTap } from "./link-tap";
import { LONG_PRESS_MS, useMessageActions } from "./message-actions";
import {
  MenuPressContext,
  reportTouch,
  rowGestureBegan,
  RowIdContext,
  rowTarget,
  touchedPart,
} from "./row-touch";

/**
 * Two taps this close together are a double tap. A single tap waits this
 * long to be sure it isn't one.
 */
const DOUBLE_TAP_MS = 200;
/** A tap moving further than this is a drag (to reveal times), not a tap. */
const TAP_SLOP = 10;

/**
 * Opens the menu over what the row lifts at the touch's height `y` on
 * screen (see `useRowTarget`).
 */
function openRowMenu(row: string, y: number) {
  const target = rowTarget(row);
  if (target === undefined) return;
  impact();
  target.release();
  target.lift(y);
}

/**
 * A message's row, across the screen and from the top of the sender's name
 * to the bottom of the message, which takes its taps, double taps, and
 * holds wherever they land: a tap opens the message's thread in a
 * conversation, and a double tap or a hold lifts it with its menu, the
 * same either way. On a part with its own menu (`MenuTargetView`), a
 * double tap lifts just that part, as a hold on it does. Parts
 * that are buttons of their own (a photo, a link card, the thread's count,
 * a reaction) keep their touches to themselves.
 *
 * The taps are native recognizers, since a Pressable drops the second of
 * two quick taps. They see every touch in the row; the Pressables say
 * where it landed, the row's own only when no part's took it. A single
 * tap fires once a double tap can no longer begin.
 */
export function MessageRowTarget({
  message,
  children,
}: {
  message: Message;
  children: ReactNode;
}) {
  const { openThread } = useMessageActions();
  const row = useId();
  // A message still sending (or that failed) has no menu or thread yet.
  // A deleted one has its thread, but no menu.
  const sent = message.status === undefined;
  const holdable = sent && message.deleted !== true;
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(DOUBLE_TAP_MS)
    .runOnJS(true)
    .onBegin(rowGestureBegan)
    .onEnd((event, success) => {
      const part = touchedPart();
      if (!success || part === null) return;
      if (part !== "row") part.openMenu();
      else if (holdable) openRowMenu(row, event.absoluteY);
    });
  const singleTap = Gesture.Tap()
    // A hold opens the menu instead.
    .maxDuration(LONG_PRESS_MS)
    .maxDistance(TAP_SLOP)
    .enabled(openThread !== undefined && sent)
    .runOnJS(true)
    .onBegin(rowGestureBegan)
    .onEnd((_, success) => {
      if (!success || touchedPart() === null || wasLinkTap()) return;
      openThread?.(message);
    });
  const press = {
    delayLongPress: LONG_PRESS_MS,
    onLongPress: (event: GestureResponderEvent) => {
      if (holdable) openRowMenu(row, event.nativeEvent.pageY);
    },
    onPressIn: (event: GestureResponderEvent) => {
      reportTouch("row");
      if (holdable) rowTarget(row)?.pressIn(event.nativeEvent.pageY);
    },
    onPressOut: () => rowTarget(row)?.release(),
  } satisfies MenuPress;
  return (
    <RowIdContext value={row}>
      <GestureDetector gesture={Gesture.Exclusive(doubleTap, singleTap)}>
        <Pressable
          // Not one element to VoiceOver: the message's parts keep their
          // own, and the thread's count and quote are its buttons.
          accessible={false}
          {...press}
        >
          {/* Links in text that isn't a part of its own hold the row. */}
          <MenuPressContext value={press}>{children}</MenuPressContext>
        </Pressable>
      </GestureDetector>
    </RowIdContext>
  );
}
