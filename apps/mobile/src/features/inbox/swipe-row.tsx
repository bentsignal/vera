import type { ComponentProps, ReactNode } from "react";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import type { SharedValue } from "react-native-reanimated";
import { useRef } from "react";
import { Pressable, Text } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import { useCSSVariable } from "uniwind";

import { SymbolIcon } from "~/components/symbol-icon";

export interface SwipeAction {
  key: string;
  label: string;
  icon: ComponentProps<typeof SymbolIcon>["name"];
  /** The action's background, such as `bg-accent`. */
  className: string;
  onPress: () => void;
}

type Side = "leading" | "trailing";

const ACTION_WIDTH = 76;
/** Dragging this far past the buttons runs the edge-most action on release. */
const FULL_SWIPE = 120;

function fullSwipeHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/**
 * One side's buttons. The edge-most action's color also fills the space a
 * long drag uncovers, and its icon follows the row's edge, as in Mail and
 * Messages. Crossing the full-swipe distance ticks a haptic.
 */
function Actions({
  actions,
  side,
  translation,
  onFull,
  close,
}: {
  actions: readonly SwipeAction[];
  side: Side;
  translation: SharedValue<number>;
  /** Called as the drag crosses the full-swipe distance, either way. */
  onFull: (full: boolean) => void;
  close: () => void;
}) {
  const width = ACTION_WIDTH * actions.length;
  const sign = side === "leading" ? 1 : -1;
  useAnimatedReaction(
    () => translation.value * sign > width + FULL_SWIPE,
    (now, before) => {
      if (before === null || now === before) return;
      scheduleOnRN(onFull, now);
      if (now) scheduleOnRN(fullSwipeHaptic);
    },
  );
  const followEdge = useAnimatedStyle(() => ({
    transform: [
      { translateX: sign * Math.max(0, translation.value * sign - width) },
    ],
  }));
  // The edge-most action sits at the screen edge: first on the leading
  // side, last on the trailing side.
  const ordered = side === "leading" ? actions : [...actions].reverse();
  const edge = side === "leading" ? 0 : ordered.length - 1;
  return (
    <Animated.View className="flex-row" style={{ width }}>
      {ordered.map((action, index) => (
        <Pressable
          key={action.key}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          className={`items-center justify-center ${action.className}`}
          style={{ width: ACTION_WIDTH, zIndex: index === edge ? 0 : 1 }}
          onPress={() => {
            close();
            action.onPress();
          }}
        >
          {index === edge && (
            <Animated.View
              className={`absolute inset-y-0 w-[1000px] ${action.className}`}
              style={side === "leading" ? { left: 0 } : { right: 0 }}
            />
          )}
          <Animated.View
            className="items-center gap-1"
            style={index === edge ? followEdge : undefined}
          >
            <SymbolIcon
              name={action.icon}
              size={20}
              tintColorClassName="accent-white"
            />
            <Text className="text-caption font-medium text-white">
              {action.label}
            </Text>
          </Animated.View>
        </Pressable>
      ))}
    </Animated.View>
  );
}

/**
 * A list row with swipe actions: swiping right shows `leading`, swiping
 * left shows `trailing`. Tap an action, or swipe all the way to run the
 * one at the edge. Each side takes any number of actions, so more (Mark as
 * Unread, Delete) slot in without changing the row.
 */
export function SwipeRow({
  leading = [],
  trailing = [],
  children,
}: {
  leading?: readonly SwipeAction[];
  trailing?: readonly SwipeAction[];
  children: ReactNode;
}) {
  // The side dragged past the full-swipe distance, if any.
  const full = useRef<Side | null>(null);
  const swipeable = useRef<SwipeableMethods>(null);
  // Opaque, so the actions behind the row show only as it slides.
  const background = useCSSVariable("--color-background");
  return (
    <ReanimatedSwipeable
      ref={swipeable}
      childrenContainerStyle={{
        backgroundColor:
          typeof background === "string" ? background : undefined,
      }}
      friction={1.5}
      overshootFriction={4}
      leftThreshold={ACTION_WIDTH / 2}
      rightThreshold={ACTION_WIDTH / 2}
      renderLeftActions={
        leading.length === 0
          ? undefined
          : (_progress, translation, methods) => (
              <Actions
                actions={leading}
                side="leading"
                translation={translation}
                onFull={(on) => {
                  full.current = on ? "leading" : null;
                }}
                close={methods.close}
              />
            )
      }
      renderRightActions={
        trailing.length === 0
          ? undefined
          : (_progress, translation, methods) => (
              <Actions
                actions={trailing}
                side="trailing"
                translation={translation}
                onFull={(on) => {
                  full.current = on ? "trailing" : null;
                }}
                close={methods.close}
              />
            )
      }
      onSwipeableWillOpen={() => {
        // Whichever side was dragged past the full-swipe distance runs its
        // edge-most action; the row then closes instead of staying open.
        if (full.current === "leading") leading[0]?.onPress();
        if (full.current === "trailing") trailing[0]?.onPress();
      }}
      onSwipeableOpen={() => {
        if (full.current !== null) {
          full.current = null;
          swipeable.current?.close();
        }
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
