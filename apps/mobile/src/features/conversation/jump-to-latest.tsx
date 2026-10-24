import type { SharedValue } from "react-native-reanimated";
import { useState } from "react";
import { Pressable } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { GlassSurface } from "~/components/glass-surface";
import { SymbolIcon } from "~/components/symbol-icon";
import { cn } from "~/lib/cn";
import { composerTop } from "./jump-lift";

/** The jump button's size. */
const JUMP_SIZE = 40;
/** How far above the composer it sits. */
const GAP = 12;

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
  above,
  keyboard,
  onPress,
}: {
  visible: SharedValue<boolean>;
  /** The floating composer's height, which it sits `GAP` above. */
  above: SharedValue<number>;
  /**
   * Over a list with nothing of its own lifting it with the keyboard (the
   * native list): it rises with the keyboard as the composer does
   * (`composerTop`), from the composer's `bottomInset`, and holds while
   * `frozen` (the long-press menu has the keyboard, see `useMenuKeyboard`).
   */
  keyboard?: { bottomInset: number; frozen?: SharedValue<boolean> };
  onPress: () => void;
}) {
  const { height, progress } = useReanimatedKeyboardAnimation();
  const bottomInset = keyboard?.bottomInset;
  const frozen = keyboard?.frozen;
  /** How far it rises, held while the keyboard is frozen. */
  const risen = useSharedValue(0);
  useAnimatedReaction(
    () => ({
      // Watched too, so it catches up when the menu lets go with the
      // keyboard somewhere else (closing into a sheet leaves it down).
      held: frozen?.get() === true,
      to:
        bottomInset === undefined
          ? above.get()
          : composerTop({
              bottomInset,
              composer: above.get(),
              keyboardHeight: height.get(),
              progress: progress.get(),
            }),
    }),
    ({ held, to }) => {
      if (!held) risen.set(to);
    },
  );
  // Moved, not laid out again, as the composer changes height.
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: -risen.get() }],
  }));
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
    <Animated.View
      pointerEvents={shown ? "box-none" : "none"}
      className="absolute right-4"
      style={[{ bottom: GAP }, lift]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Jump to latest"
        // Hidden, it's out of VoiceOver and TalkBack too: `aria-hidden` sets
        // iOS's `accessibilityElementsHidden` and Android's
        // `importantForAccessibility="no-hide-descendants"` (the first was
        // iOS only, so TalkBack still offered the invisible button).
        aria-hidden={!shown}
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
    </Animated.View>
  );
}
