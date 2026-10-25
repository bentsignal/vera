import type { LayoutChangeEvent } from "react-native";
import type Animated from "react-native-reanimated";
import type { AnimatedRef } from "react-native-reanimated";
import { useEffect } from "react";
import {
  scrollTo,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
} from "react-native-reanimated";
import { useIsFocused } from "expo-router";

import { env } from "~/env";
import { registerDevList } from "~/features/dev/dev-list";

/**
 * The React Native list's constant-speed fling for benchmarks
 * (`veraDev.list().fling`): each frame on the UI thread, the list moves on
 * toward older messages from wherever it is, as `bench.fling` did and as
 * the native list's `benchFling` does, so the two compare fairly. The list
 * is inverted, so older is a larger offset. Returns the scroll view's
 * `onContentSizeChange` and `onLayout`, which also call its own.
 */
export function useDevFling(
  scrollRef: AnimatedRef<Animated.ScrollView>,
  own: {
    onContentSizeChange?: (width: number, height: number) => void;
    onLayout?: (event: LayoutChangeEvent) => void;
  },
) {
  const focused = useIsFocused();
  const offset = useScrollOffset(scrollRef);
  const speed = useSharedValue(0);
  const duration = useSharedValue(0);
  const content = useSharedValue(0);
  const viewport = useSharedValue(0);
  const travelled = useSharedValue(0);
  const edgeMs = useSharedValue(0);
  const frame = useFrameCallback((info) => {
    "worklet";
    if (speed.get() === 0) return;
    if (info.timeSinceFirstFrame >= duration.get()) {
      speed.set(0);
      return;
    }
    const step = info.timeSincePreviousFrame ?? 1000 / 60;
    const max = Math.max(0, content.get() - viewport.get());
    const from = offset.get();
    const to = Math.min(max, from + (speed.get() * step) / 1000);
    if (to <= from + 0.01) edgeMs.set(edgeMs.get() + step);
    travelled.set(travelled.get() + Math.max(0, to - from));
    scrollTo(scrollRef, 0, to, false);
  }, false);

  // eslint-disable-next-line no-restricted-syntax -- Hands the list to benchmark scripts, which run outside React; dev tools only.
  useEffect(() => {
    if (!env.devTools || !focused) return;
    return registerDevList({
      fling: (pointsPerSecond, ms) => {
        travelled.set(0);
        edgeMs.set(0);
        duration.set(ms);
        speed.set(pointsPerSecond);
        frame.setActive(true);
        return new Promise((resolve) => {
          setTimeout(() => {
            frame.setActive(false);
            resolve({
              edgeMs: Math.round(edgeMs.get()),
              travelled: Math.round(travelled.get()),
            });
          }, ms + 100);
        });
      },
      kind: "rn",
    });
  }, [duration, edgeMs, focused, frame, speed, travelled]);

  return {
    onContentSizeChange: (width: number, height: number) => {
      content.set(height);
      own.onContentSizeChange?.(width, height);
    },
    onLayout: (event: LayoutChangeEvent) => {
      viewport.set(event.nativeEvent.layout.height);
      own.onLayout?.(event);
    },
  };
}
