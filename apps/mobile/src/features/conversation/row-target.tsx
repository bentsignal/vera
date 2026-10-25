import type { ReactNode } from "react";
import type { GestureResponderEvent } from "react-native";
import { useId } from "react";
import { Pressable } from "react-native";

import type { MenuPress } from "./row-touch";
import type { Message } from "./types";
import { impact } from "~/lib/native-extras";
import { wasLinkTap } from "./link-tap";
import { LONG_PRESS_MS, useMessageActions } from "./message-actions";
import {
  MenuPressContext,
  rowGestureBegan,
  RowIdContext,
  rowTarget,
} from "./row-touch";

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
 * to the bottom of the message. A tap opens its thread on release and a
 * hold lifts it with its menu. Parts that are buttons of their own
 * (a photo, a link card, the thread's count,
 * a reaction) keep their touches to themselves.
 *
 * Text parts forward the row's press through MenuPressContext. Buttons
 * keep their own press, and a long press suppresses the thread action.
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
  const press = {
    delayLongPress: LONG_PRESS_MS,
    onPress: () => {
      if (sent && !wasLinkTap()) openThread?.(message);
    },
    onLongPress: (event: GestureResponderEvent) => {
      if (holdable) openRowMenu(row, event.nativeEvent.pageY);
    },
    onPressIn: (event: GestureResponderEvent) => {
      rowGestureBegan();
      if (holdable) rowTarget(row)?.pressIn(event.nativeEvent.pageY);
    },
    onPressOut: () => rowTarget(row)?.release(),
  } satisfies MenuPress;
  return (
    <RowIdContext value={row}>
      <Pressable
        // Not one element to VoiceOver: the message's parts keep their
        // own, and the thread's count and quote are its buttons.
        accessible={false}
        {...press}
      >
        {/* Links in text that isn't a part of its own hold the row. */}
        <MenuPressContext value={press}>{children}</MenuPressContext>
      </Pressable>
    </RowIdContext>
  );
}
