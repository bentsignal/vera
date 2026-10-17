import type { SharedValue } from "react-native-reanimated";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { GlassSurface } from "~/components/glass-surface";
import { SymbolIcon } from "~/components/symbol-icon";
import { cn } from "~/lib/cn";

/** The jump button's size. */
const JUMP_SIZE = 40;

function JumpChevron() {
  return (
    <SymbolIcon
      name={{ android: "keyboard_arrow_down", ios: "chevron.down" }}
      size={17}
      weight="semibold"
      tintColorClassName="accent-foreground"
    />
  );
}

/**
 * Back down to the newest message, once you've scrolled away from it. On
 * iOS a Liquid Glass circle that materializes and dissolves like the
 * system's own controls (glass can't fade, see `GlassSurface`); a plain
 * raised circle on Android.
 */
export function JumpToLatest({
  visible,
  bottom,
  onPress,
}: {
  visible: SharedValue<boolean>;
  /** Distance from the bottom edge, above the floating composer. */
  bottom: number;
  onPress: () => void;
}) {
  const [shown, setShown] = useState(false);
  useAnimatedReaction(
    () => visible.value,
    (now, before) => {
      if (now !== before) scheduleOnRN(setShown, now);
    },
  );
  const chevron = useAnimatedStyle(() => ({
    opacity: withTiming(visible.value ? 1 : 0, { duration: 160 }),
    transform: [
      { scale: withTiming(visible.value ? 1 : 0.6, { duration: 200 }) },
    ],
  }));
  return (
    <View
      pointerEvents={shown ? "box-none" : "none"}
      className="absolute right-4"
      style={{ bottom }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Jump to latest"
        accessibilityElementsHidden={!shown}
        onPress={onPress}
        hitSlop={6}
      >
        <GlassSurface
          isInteractive
          shown={shown}
          className="items-center justify-center rounded-full"
          androidClassName={cn(
            "bg-background-elevated border-hairline border-separator shadow-sm",
            !shown && "opacity-0",
          )}
          style={{ height: JUMP_SIZE, width: JUMP_SIZE }}
        >
          <Animated.View style={chevron}>
            <JumpChevron />
          </Animated.View>
        </GlassSurface>
      </Pressable>
    </View>
  );
}
