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
/** The most frames the glass follows the list's room down. */
const FOLLOW_FRAMES = 120;

/**
 * Holds the glass at the field's height until the field gets shorter, then
 * tells the list (`report.onSentShorter`) and follows the list's room down
 * to the field, its bottom staying put: the room closes as the messages
 * make room for the one sent (see `useComposerRoom`), so the glass's edge
 * stays on the messages' all the way. It follows the field too, as when
 * attachments close at the same time. If the field doesn't get shorter,
 * the glass lets go.
 */
function settle(
  field: AnimatedRef<View>,
  held: SharedValue<number>,
  sends: SharedValue<number>,
  { onSentShorter, room }: Pick<ComposerReport, "onSentShorter" | "room">,
) {
  "worklet";
  // A later send takes the glass over.
  const send = sends.get() + 1;
  sends.set(send);
  const before = measure(field);
  if (before === null) return;
  const from = before.height;
  held.set(from);
  let frames = 0;
  // How much shorter the field got, and the room for it then.
  let lost = 0;
  let wasRoom = 0;
  function frame() {
    if (sends.get() !== send) return;
    frames += 1;
    const now = measure(field)?.height ?? from;
    if (lost === 0) {
      if (now < from - 0.5) {
        lost = from - now;
        wasRoom = room.get();
        onSentShorter(lost);
      } else {
        if (frames < WAIT_FRAMES) requestAnimationFrame(frame);
        else held.set(0);
        return;
      }
    }
    const above = lost - (wasRoom - room.get());
    if (above <= 0.5 || frames > FOLLOW_FRAMES) {
      held.set(0);
      return;
    }
    held.set(now + above);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/**
 * What `GlassField` needs, and `settle`, to call just before sending empties
 * the field: rather than jumping down to the shorter field, the glass eases
 * down to it with the list (see `ComposerReport`).
 */
export function useFieldGlass(report: ComposerReport) {
  /** The field, measured as it changes. */
  const field = useAnimatedRef<View>();
  /** The least height the glass is drawn at, while it eases down. */
  const held = useSharedValue(0);
  const sends = useSharedValue(0);
  const focused = useSharedValue(false);
  const { input } = useReanimatedFocusedInput();
  // A line typed in or out changes the field's height: the list hears it
  // in the frame the field changes, rather than once its layout reaches
  // JavaScript a few frames later, so the messages move with the field.
  // Not while the glass eases down after a send, which the list waits for.
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
    field,
    held,
    /** For the field's text input. */
    focus: {
      onFocus: () => focused.set(true),
      onBlur: () => focused.set(false),
    },
    // Android's bar is solid, with a border along its top that moves at
    // once: glass held above it would show over the messages.
    settle: () => {
      const { onSentShorter, room } = report;
      if (IOS)
        scheduleOnUI(settle, field, held, sends, { onSentShorter, room });
    },
  };
}

/**
 * The message field: its glass, and what's in it on top. What's in it is
 * already where it ends up as the glass eases down, so it never moves.
 */
export function GlassField({
  field,
  held,
  minHeight,
  children,
}: Omit<ReturnType<typeof useFieldGlass>, "settle" | "focus"> & {
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
