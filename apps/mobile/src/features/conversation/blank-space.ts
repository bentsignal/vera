import type { SharedValue } from "react-native-reanimated";
import { useRef } from "react";
import { useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";

import { GROW_EASING, GROW_MS } from "./moves";

/**
 * A thread starts at the top, under its original: the room its replies
 * leave below them is padding on the newest side, which the keyboard
 * opens into (see `KeyboardChatScrollView`'s `blankSpace`), so opening
 * it moves nothing until the replies would be covered. Off, the list
 * starts at the bottom like a conversation.
 */
export function useBlankSpace(
  enabled: boolean,
  /** The list has faded in: what it settles on from here eases there. */
  shown: boolean,
) {
  const blankSpace = useSharedValue(0);
  const sizes = useRef({ content: 0, list: 0 });
  // The same, for rows that change size to keep up with on the UI thread
  // (see `lift` in grow.tsx).
  const content = useSharedValue(0);
  const list = useSharedValue(0);

  function update() {
    if (!enabled) return;
    const { content: measured, list: height } = sizes.current;
    scheduleOnUI(() => {
      "worklet";
      content.set(measured);
      list.set(height);
      const space = Math.max(0, height - measured);
      // Most changes are already here: the row that changed size updated
      // it on the UI thread with the moves that keep the rows still (see
      // `blankChange` in moves.ts). What's left, a size the layout settled
      // on that wasn't foreseen (a reply that left, a row that grew on its
      // own), eases there rather than jumping the thread by as much.
      if (!shown || Math.abs(space - blankSpace.get()) < 1) {
        blankSpace.set(space);
      } else {
        blankSpace.set(
          withTiming(space, { duration: GROW_MS, easing: GROW_EASING }),
        );
      }
    });
  }

  return {
    blankSpace: enabled ? blankSpace : undefined,
    /** What a row changing size updates at once (see `Blank`). */
    sizes: enabled ? { content, list, space: blankSpace } : undefined,
    /** The list's own height, from its `onLayout`. */
    onListHeight: (height: number) => {
      sizes.current.list = height;
      update();
    },
    /** Everything in it, from its `onContentSizeChange`. */
    onContentHeight: (height: number) => {
      sizes.current.content = height;
      update();
    },
  };
}

/** The blank space under a thread's replies, and what it's made from. */
export interface Blank {
  readonly space: SharedValue<number>;
  readonly content: SharedValue<number>;
  readonly list: SharedValue<number>;
  /**
   * The room the list keeps under its newest row whatever the blank
   * space, for the keyboard and the composer (see `useLatest`): the list's
   * inset is the larger of the two, so only blank space past this moves
   * anything as it changes.
   */
  readonly floor: SharedValue<number>;
}

export type BlankSpace = ReturnType<typeof useBlankSpace>;
