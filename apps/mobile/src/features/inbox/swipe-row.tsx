import type { ReactNode } from "react";
import type { SharedValue } from "react-native-reanimated";
import { useRef } from "react";
import { Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import { useCSSVariable } from "uniwind";

import type { RowAction } from "./swipe-actions";
import { SymbolIcon } from "~/components/symbol-icon";
import { afterSwipe } from "./swipe-actions";

type Side = "leading" | "trailing";

/** How far a row slides before letting go runs its action. */
const TRIGGER = 120;
/** The space the icon keeps from the screen edge. */
const ICON_INSET = 24;

const TONE = {
  accent: "bg-accent",
  destructive: "bg-destructive",
  gray: "bg-[#8e8e93]",
} as const;

function triggerHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/**
 * The color and icon a swipe uncovers. Past the trigger point the icon
 * grows and a haptic ticks, so you know letting go will run it.
 */
function Reveal({
  action,
  side,
  translation,
  onArmed,
}: {
  action: RowAction;
  side: Side;
  translation: SharedValue<number>;
  /** Called as the drag crosses the trigger point, either way. */
  onArmed: (armed: boolean) => void;
}) {
  const sign = side === "leading" ? 1 : -1;
  useAnimatedReaction(
    () => translation.value * sign > TRIGGER,
    (now, before) => {
      if (before === null || now === before) return;
      scheduleOnRN(onArmed, now);
      if (now) scheduleOnRN(triggerHaptic);
    },
  );
  const icon = useAnimatedStyle(() => ({
    opacity: Math.min(1, (translation.value * sign) / (TRIGGER * 0.6)),
    transform: [{ scale: translation.value * sign > TRIGGER ? 1.2 : 1 }],
  }));
  return (
    <View
      pointerEvents="none"
      className={`w-full justify-center ${TONE[action.tone]}`}
      style={
        side === "leading"
          ? { paddingLeft: ICON_INSET }
          : { paddingRight: ICON_INSET }
      }
    >
      <Animated.View
        className={`items-center gap-1 ${side === "trailing" ? "self-end" : "self-start"}`}
        style={icon}
      >
        <SymbolIcon
          name={action.icon}
          size={22}
          tintColorClassName="accent-white"
        />
        <Text className="text-caption font-medium text-white">
          {action.label}
        </Text>
      </Animated.View>
    </View>
  );
}

/**
 * Android's swipe actions, as in Gmail: swipe a row right for `leading`'s
 * first action or left for `trailing`'s, past the trigger point, and let
 * go. The row always springs back; there are no buttons to tap. (iOS uses
 * SwiftUI's own swipe actions; see `inbox-row.ios.tsx`.)
 */
export function SwipeRow({
  leading = [],
  trailing = [],
  children,
}: {
  leading?: readonly RowAction[];
  trailing?: readonly RowAction[];
  children: ReactNode;
}) {
  // The side dragged past the trigger point, if any.
  const armed = useRef<Side | null>(null);
  // Opaque, so the color behind the row shows only as it slides.
  const background = useCSSVariable("--color-background");
  const [first] = leading;
  const [last] = trailing;
  return (
    <ReanimatedSwipeable
      friction={1}
      overshootLeft={first !== undefined}
      overshootRight={last !== undefined}
      // Never stays open: letting go either runs the action or snaps back.
      leftThreshold={Number.MAX_SAFE_INTEGER}
      rightThreshold={Number.MAX_SAFE_INTEGER}
      childrenContainerStyle={{
        backgroundColor:
          typeof background === "string" ? background : undefined,
      }}
      renderLeftActions={
        first === undefined
          ? undefined
          : (_progress, translation) => (
              <Reveal
                action={first}
                side="leading"
                translation={translation}
                onArmed={(on) => {
                  armed.current = on ? "leading" : null;
                }}
              />
            )
      }
      renderRightActions={
        last === undefined
          ? undefined
          : (_progress, translation) => (
              <Reveal
                action={last}
                side="trailing"
                translation={translation}
                onArmed={(on) => {
                  armed.current = on ? "trailing" : null;
                }}
              />
            )
      }
      onSwipeableWillClose={() => {
        const action =
          armed.current === "leading"
            ? first
            : armed.current === "trailing"
              ? last
              : undefined;
        armed.current = null;
        if (action !== undefined) afterSwipe(action.onPress);
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
