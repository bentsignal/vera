import { useRef, useState } from "react";
import {
  KeyboardController,
  useKeyboardHandler,
} from "react-native-keyboard-controller";
import { useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

/** Longest the hold lasts if the keyboard never reports it's back. */
const HOLD_LIMIT_MS = 1500;

/**
 * The native list's `keyboardFrozen` around the long-press menu, on both
 * platforms. The menu's modal takes the keyboard down; the held message
 * stays where it was with the keyboard up, and lands there as the menu
 * closes and the keyboard comes back, so it never drops to the bottom and
 * gets pushed back up (round 2, item 2). `hold` runs as the message is
 * held, before the menu opens, so the freeze reaches native in the same
 * update as the lift, before the modal mounts. It lets go once the
 * keyboard is all the way back up, or at once if the menu closed into
 * something else and the keyboard stays down.
 */
export function useMenuKeyboardHold() {
  const [frozen, setFrozen] = useState(false);
  /** As `frozen`, on the UI thread, for the jump button. */
  const freeze = useSharedValue(false);
  /** The keyboard is coming back; its end lets go. */
  const returning = useSharedValue(false);
  /** Which hold a fallback timer belongs to. */
  const holds = useRef(0);
  const holding = useRef(false);

  function release() {
    holds.current += 1;
    holding.current = false;
    returning.set(false);
    freeze.set(false);
    setFrozen(false);
  }
  function releaseLater() {
    const hold = holds.current;
    setTimeout(() => {
      if (holds.current === hold && holding.current) release();
    }, HOLD_LIMIT_MS);
  }

  useKeyboardHandler(
    {
      onEnd: (event) => {
        "worklet";
        if (returning.get() && event.height > 0) {
          returning.set(false);
          scheduleOnRN(release);
        }
      },
    },
    [],
  );

  return {
    frozen,
    freeze,
    /** A message was held: freeze if the keyboard is up. */
    hold: () => {
      if (!KeyboardController.isVisible()) return;
      holds.current += 1;
      holding.current = true;
      freeze.set(true);
      setFrozen(true);
    },
    /** For `MessageActionsProvider`'s `menuKeyboard`. */
    menuKeyboard: {
      onOpen: () => undefined,
      onClosing: () => {
        // The keyboard may start back as the menu fades.
        if (holding.current) returning.set(true);
      },
      onClosed: (backToChat: boolean) => {
        if (!holding.current) return;
        if (!backToChat) {
          release();
          return;
        }
        returning.set(true);
        if (!KeyboardController.isVisible()) {
          KeyboardController.setFocusTo("current");
        }
        releaseLater();
      },
    },
  };
}
