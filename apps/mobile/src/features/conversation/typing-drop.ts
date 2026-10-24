import type { NativeEvent } from "react-native-keyboard-controller";
import type { SharedValue } from "react-native-reanimated";
import { useState } from "react";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

/**
 * How far below its row who's typing is drawn. In a thread with room under
 * its replies (see `useBlankSpace`), it sits at the bottom by the composer,
 * where it is in a conversation, rather than under the newest reply: each
 * reply that came in pushed it further down the screen. It drops by the
 * room the keyboard and composer leave there, so it rides up with them,
 * and is back under the newest reply once the replies reach the composer.
 *
 * `dropped` is whether it's down there, for React: a message that takes
 * its place opens under the newest reply, away from the indicator, so it
 * doesn't grow out of it (see `useTypingRow`).
 */
export function useTypingDrop({
  blankSpace,
  composer,
  keyboardOffset,
}: {
  /** A thread's room under its replies (see `useBlankSpace`). */
  blankSpace: SharedValue<number> | undefined;
  /** The composer's room over the list's bottom (see `useLatest`). */
  composer: SharedValue<number>;
  /** What the keyboard covers that's already room (its `offset`). */
  keyboardOffset: number;
}) {
  const lift = useKeyboardLift(keyboardOffset);
  const drop = useDerivedValue(() => {
    if (blankSpace === undefined) return 0;
    return Math.max(0, blankSpace.get() - lift.get() - composer.get());
  });
  const [dropped, setDropped] = useState(false);
  useAnimatedReaction(
    () => drop.get() > 0,
    (now, before) => {
      if (now !== before) scheduleOnRN(setDropped, now);
    },
  );
  return { drop, dropped };
}

export type TypingDrop = ReturnType<typeof useTypingDrop>;

/**
 * How far the keyboard lifts the composer, as `FloatingComposer`'s
 * `KeyboardStickyView` works it out, each frame of its move. (On iOS,
 * `useReanimatedKeyboardAnimation` jumps to where the keyboard is going,
 * and the composer animates there with the keyboard. The indicator, in
 * the list, didn't: it hid behind the rising composer for a few frames,
 * then jumped.)
 */
function useKeyboardLift(offset: number) {
  const lift = useSharedValue(0);
  function update(event: NativeEvent) {
    "worklet";
    lift.set(Math.max(0, event.height - event.progress * offset));
  }
  useKeyboardHandler(
    {
      onMove: update,
      onInteractive: update,
      onEnd: update,
    },
    [offset],
  );
  return lift;
}
