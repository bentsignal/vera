import type { ReactNode } from "react";
import type { SharedValue } from "react-native-reanimated";
import { createContext, use } from "react";
import { Text } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { formatTime } from "~/lib/format";

/** How far a drag slides your messages over to show times. */
export const REVEAL_WIDTH = 72;

const RevealContext = createContext<SharedValue<number> | null>(null);

function useReveal() {
  const reveal = use(RevealContext);
  if (reveal === null) {
    throw new Error("Message rows must render inside RevealTimes");
  }
  return reveal;
}

/**
 * iMessage's drag-to-see-times: dragging the conversation left slides your
 * messages over and brings every message's time in from the right edge.
 * Letting go springs everything back. Vertical drags still scroll.
 */
export function RevealTimes({ children }: { children: ReactNode }) {
  const reveal = useSharedValue(0);
  const pan = Gesture.Pan()
    .activeOffsetX(-12)
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      // Stops once the times are fully in view, like iMessage.
      reveal.set(Math.min(REVEAL_WIDTH, Math.max(0, -event.translationX)));
    })
    .onFinalize(() => {
      // Settles back with one small overshoot, not a long wobble.
      reveal.set(withSpring(0, { damping: 30, stiffness: 320 }));
    });
  return (
    <RevealContext value={reveal}>
      <GestureDetector gesture={pan}>{children}</GestureDetector>
    </RevealContext>
  );
}

/** Wraps your own messages so they slide left as times are revealed. */
export function SlideWithReveal({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const reveal = useReveal();
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: enabled ? -reveal.value : 0 }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * A message's time, waiting just past the right edge until revealed.
 * `top` skips anything above the bubble, such as the sender's name.
 */
export function RevealedTime({ date, top = 0 }: { date: Date; top?: number }) {
  const reveal = useReveal();
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, reveal.value / REVEAL_WIDTH),
    transform: [{ translateX: REVEAL_WIDTH - reveal.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute top-0 right-0 bottom-0 justify-center pr-3"
      style={[{ paddingTop: top, width: REVEAL_WIDTH }, style]}
    >
      <Text className="text-caption text-muted text-right">
        {formatTime(date)}
      </Text>
    </Animated.View>
  );
}
