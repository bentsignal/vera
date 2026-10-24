import type { ComponentProps } from "react";
import { Modal, Pressable, Text, useWindowDimensions } from "react-native";
import Animated, {
  clamp,
  Easing,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { BlurView } from "expo-blur";

import type { DevHold } from "./dev-menu-layout";
import {
  BAR_HEIGHT,
  BAR_WIDTH,
  MENU_WIDTH,
} from "~/features/conversation/glass-menu-parts";
import { devLift } from "./dev-menu-layout";

// `/dev-native-list`'s stand-in for the glass message menu, to try the
// native lift (contract.ts, `lift`): the conversation blurs, a reaction bar
// and actions go around the held message where the real menu's layout puts
// them, and the real message lifts between them. Only for the dev screen;
// the app's menu is glass-message-menu.tsx.

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
const OPEN_SPRING = { damping: 19, mass: 0.9, stiffness: 230 };
const ACTIONS = ["Reply", "Copy", "Forward", "Delete"];
const EMOJI = ["❤️", "👍", "👎", "😂", "‼️", "❓"];

/**
 * The menu around a held message. `onClosing` clears the lift as it starts
 * closing (the message plays back with it); `onClosed` removes it.
 */
export function DevMenu({
  hold,
  onClosing,
  onClosed,
}: {
  hold: DevHold;
  onClosing: () => void;
  onClosed: () => void;
}) {
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { layout } = devLift(hold, screen, insets);
  const progress = useSharedValue(0);
  useAnimatedReaction(
    () => true,
    (_, previous) => {
      if (previous === null) progress.set(withSpring(1, OPEN_SPRING));
    },
  );
  function close() {
    onClosing();
    progress.set(
      withTiming(
        0,
        { duration: 240, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished === true) scheduleOnRN(onClosed);
        },
      ),
    );
  }
  const blur = useAnimatedProps(() => ({
    intensity: clamp(progress.value, 0, 1) * 28,
  }));
  const fade = useAnimatedStyle(() => ({
    opacity: clamp(progress.value, 0, 1),
  }));
  const pop = useAnimatedStyle(() => ({
    opacity: clamp(progress.value, 0, 1),
    transform: [{ scale: 0.6 + 0.4 * progress.value }],
  }));
  return (
    <Modal transparent visible animationType="none" onRequestClose={close}>
      <Pressable
        accessibilityLabel="Close"
        className="absolute inset-0"
        onPress={close}
      >
        <AnimatedBlurView
          animatedProps={blur}
          className="absolute inset-0"
          tint="default"
        />
        <Animated.View
          className="absolute inset-0 bg-black/10 dark:bg-black/35"
          style={fade}
        />
      </Pressable>
      <Animated.View
        className="bg-background-elevated absolute flex-row items-center justify-around rounded-full"
        style={[
          {
            height: BAR_HEIGHT,
            left: layout.barLeft,
            top: layout.barTop,
            width: BAR_WIDTH,
          },
          pop,
        ]}
      >
        {EMOJI.map((emoji) => (
          <Pressable
            key={emoji}
            accessibilityLabel={emoji}
            accessibilityRole="button"
            onPress={close}
          >
            <Text className="text-title">{emoji}</Text>
          </Pressable>
        ))}
      </Animated.View>
      <DevActions
        style={[
          { left: layout.menuLeft, top: layout.menuTop, width: MENU_WIDTH },
          pop,
        ]}
        onPick={close}
      />
    </Modal>
  );
}

function DevActions({
  style,
  onPick,
}: {
  style: ComponentProps<typeof Animated.View>["style"];
  onPick: () => void;
}) {
  return (
    <Animated.View
      className="bg-background-elevated absolute overflow-hidden rounded-2xl"
      style={style}
    >
      {ACTIONS.map((action) => (
        <Pressable
          key={action}
          accessibilityRole="button"
          className="border-separator border-b px-4 py-3"
          onPress={onPick}
        >
          <Text className="text-body text-foreground">{action}</Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}
