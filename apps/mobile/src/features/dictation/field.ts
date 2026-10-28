import type { View } from "react-native";
import type { AnimatedRef } from "react-native-reanimated";
import {
  Easing,
  measure,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { dictating } from "./session";

/** No limit: the field is as tall as what's in it. */
const FREE = 100_000;
/** How long the field takes to shrink to a line, or grow back. */
const RESIZE_MS = 260;
/** Fast, then settling: an ease-out cubic, the same on both ways. */
const ease = Easing.out(Easing.cubic);

function easeOut(progress: number) {
  "worklet";
  return 1 - (1 - progress) ** 3;
}

/**
 * The message field while dictating into the draft `key`: it shrinks to a
 * line (`line` tall) as dictation starts, the text fading out and the
 * waveform in, and once the words are in, grows to fit them as the text
 * fades back. Cancelling puts it back at once.
 *
 * The field's contents keep their own height inside `content`, which only
 * clips them: `inner`, around them, is measured on the UI thread for the
 * height to grow back to, every frame, so it's right even when the
 * dictated text lays out a frame or two into growing.
 *
 * It follows `dictating` on the UI thread rather than the button tapped,
 * so a dictation started elsewhere (a shortcut) shows the same way, and a
 * composer opened while dictating into its draft starts as a line.
 */
export function useDictationField(
  key: string,
  line: number,
  inner: AnimatedRef<View>,
) {
  const limit = useSharedValue(FREE);
  const text = useSharedValue(1);
  const controls = useSharedValue(0);
  /** Each change takes over from the one before. */
  const change = useSharedValue(0);

  function collapse() {
    "worklet";
    change.set(change.get() + 1);
    limit.set(measure(inner)?.height ?? line);
    limit.set(withTiming(line, { duration: RESIZE_MS, easing: ease }));
    text.set(withTiming(0, { duration: 140 }));
    controls.set(withDelay(80, withTiming(1, { duration: 180 })));
  }

  function restore() {
    "worklet";
    change.set(change.get() + 1);
    limit.set(FREE);
    text.set(1);
    controls.set(0);
  }

  function expand() {
    "worklet";
    const id = change.get() + 1;
    change.set(id);
    const from = limit.get();
    let start = -1;
    controls.set(withTiming(0, { duration: 120 }));
    text.set(withDelay(60, withTiming(1, { duration: 200 })));
    function frame(timestamp: number) {
      if (change.get() !== id) return;
      if (start < 0) start = timestamp;
      const progress = Math.min(1, (timestamp - start) / RESIZE_MS);
      if (progress >= 1) {
        limit.set(FREE);
        return;
      }
      const to = measure(inner)?.height ?? from;
      limit.set(from + (to - from) * easeOut(progress));
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  useAnimatedReaction(
    () => (dictating.key.get() === key ? dictating.phase.get() : 0),
    (now, before) => {
      const active = now !== 0;
      if (before === null) {
        if (active) {
          limit.set(line);
          text.set(0);
          controls.set(1);
        }
        return;
      }
      const was = before !== 0;
      if (active && !was) collapse();
      else if (!active && was) {
        if (dictating.cancelled.get()) restore();
        else expand();
      }
    },
    [key, line, inner],
  );

  return {
    /** The field's text and what's above it, clipped while it's a line. */
    content: useAnimatedStyle(() => ({
      // eslint-disable-next-line vera/no-layout-animation -- Only as dictation starts and ends, for a quarter second: the field has to change height, and the list follows the composer's height.
      maxHeight: limit.get(),
      opacity: text.get(),
    })),
    /** The send and microphone buttons, out of the way while dictating. */
    buttons: useAnimatedStyle(() => ({ opacity: 1 - controls.get() })),
    /** The dictation controls, in the field while dictating. */
    controls: useAnimatedStyle(() => ({ opacity: controls.get() })),
  };
}
