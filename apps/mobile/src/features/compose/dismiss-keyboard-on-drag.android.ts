import type { GestureResponderEvent } from "react-native";
import { useRef } from "react";
import { Keyboard } from "react-native";

/** How far a finger moves before it's a drag: Android's touch slop, in dp. */
const DRAG_SLOP = 8;

/**
 * Android `useDismissKeyboardOnDrag`: hides the keyboard once a drag
 * starts on the host's list, as Google's apps do when a list of results is
 * scrolled. Compose's `LazyColumn` reports no scrolling to React Native,
 * but React Native still sees the touches inside the host. A tap, which
 * moves less than the slop, leaves the keyboard up.
 */
export function useDismissKeyboardOnDrag() {
  // Where the current touch started, until it has hidden the keyboard.
  const start = useRef<number | null>(null);
  return {
    onTouchMove: (event: GestureResponderEvent) => {
      if (start.current === null) return;
      if (Math.abs(event.nativeEvent.pageY - start.current) < DRAG_SLOP) {
        return;
      }
      start.current = null;
      if (Keyboard.isVisible()) Keyboard.dismiss();
    },
    onTouchStart: (event: GestureResponderEvent) => {
      start.current = event.nativeEvent.pageY;
    },
  };
}
