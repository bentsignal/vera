import type { ReactNode } from "react";
import type { View } from "react-native";
import type { AnimatedRef, SharedValue } from "react-native-reanimated";
import { Platform } from "react-native";
import { useReanimatedFocusedInput } from "react-native-keyboard-controller";
import Animated, {
  measure,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";

import type { ComposerReport } from "./composer-height";
import { GlassSurface } from "~/components/glass-surface";

const IOS = Platform.OS === "ios";
/** Frames to wait for the field to get shorter before letting the glass go. */
const WAIT_FRAMES = 30;

/**
 * Tells the list (`onSentShorter`) when a send makes the field shorter, so
 * the list keeps the composer's old height until the message sent is in
 * its rows (`useComposerInset`). On iOS the glass holds at the field's
 * height until then, and lets go if the field doesn't get shorter.
 * Android's bar is solid: there's no glass to hold.
 */
function settle(
  field: AnimatedRef<View>,
  held: SharedValue<number>,
  sends: SharedValue<number>,
  onSentShorter: ComposerReport["onSentShorter"],
) {
  "worklet";
  // A later send takes over.
  const send = sends.get() + 1;
  sends.set(send);
  const before = measure(field);
  if (before === null) return;
  const from = before.height;
  if (IOS) held.set(from);
  let frames = 0;
  function frame() {
    if (sends.get() !== send) return;
    frames += 1;
    const now = measure(field)?.height ?? from;
    if (now < from - 0.5) onSentShorter(from - now);
    else if (frames < WAIT_FRAMES) {
      requestAnimationFrame(frame);
      return;
    }
    if (IOS) held.set(0);
  }
  requestAnimationFrame(frame);
}

/**
 * What `GlassField` needs (`glass`), and `settle`, to call just before
 * sending empties the field (see `ComposerReport`).
 */
export function useFieldGlass(report: ComposerReport) {
  /** The field, measured as it changes. */
  const field = useAnimatedRef<View>();
  /** The least height the glass is drawn at, while it holds after a send. */
  const held = useSharedValue(0);
  const sends = useSharedValue(0);
  const focused = useSharedValue(false);
  const { input } = useReanimatedFocusedInput();
  // A line typed in or out changes the field's height: the list hears it
  // in the frame the field changes, rather than once its layout reaches
  // JavaScript a few frames later, so the messages move with the field.
  // Not while the glass holds after a send, which the list waits for.
  useAnimatedReaction(
    () => input.get(),
    (now, before) => {
      if (!IOS || !focused.get() || held.get() > 0 || now === null) return;
      if (before?.target !== now.target) return;
      const by = now.layout.height - before.layout.height;
      if (by !== 0) report.onTyped(by);
    },
  );
  return {
    glass: {
      field,
      held,
    },
    /** For the field's text input. */
    focus: {
      onFocus: () => focused.set(true),
      onBlur: () => focused.set(false),
    },
    /**
     * `adds`: the send adds a message (not an edit's save). Every send
     * waits for its own committed clear height, even when unchanged.
     */
    settle: (adds: boolean, clear: number, files: readonly string[]) => {
      const sequence = adds ? report.onSend(clear, files) : undefined;
      scheduleOnUI(settle, field, held, sends, report.onSentShorter);
      return sequence;
    },
  };
}

/**
 * The message field: its glass, and what's in it on top. What's in it is
 * already where it ends up as the glass lets go, so it never moves.
 */
export function GlassField({
  field,
  held,
  minHeight,
  children,
}: ReturnType<typeof useFieldGlass>["glass"] & {
  minHeight: number;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    // eslint-disable-next-line vera/no-layout-animation -- Only for a moment after sending, and only this glass, drawn behind the field: nothing else changes size or moves.
    minHeight: held.get(),
  }));
  return (
    <Animated.View
      ref={field}
      className="flex-1 justify-center"
      style={{ minHeight }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            bottom: 0,
            height: "100%",
            left: 0,
            position: "absolute",
            right: 0,
          },
          style,
        ]}
      >
        <GlassSurface className="flex-1 rounded-[20px]" />
      </Animated.View>
      {children}
    </Animated.View>
  );
}
