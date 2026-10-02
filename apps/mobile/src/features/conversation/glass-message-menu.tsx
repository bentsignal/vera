import type { ReactNode } from "react";
import type { SharedValue } from "react-native-reanimated";
import { Modal, Pressable, useWindowDimensions } from "react-native";
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
import { requireOptionalNativeModule } from "expo";
import { BlurView } from "expo-blur";
import { useUniwind } from "uniwind";

import type { PreviewShape } from "./native-message-menu";
import type { Message } from "./types";
import { cn } from "~/lib/cn";
import { canCopy, copyText, selectionTick } from "~/lib/native-extras";
import {
  ActionMenu,
  BAR_HEIGHT,
  BAR_WIDTH,
  MENU_HEIGHT,
  MENU_WIDTH,
  ReactionBar,
} from "./glass-menu-parts";
import { LiftedContext } from "./lifted";

export type TargetAlign = "end" | "start";

interface Rect {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

/** The message a long press opened, and where it sits on screen. */
export interface MenuTarget {
  readonly message: Message;
  readonly rect: Rect;
  readonly align: TargetAlign;
  /** Bubbles lift as they are; plain text lifts on a card. */
  readonly shape: PreviewShape;
  /** The message as drawn in the list, lifted above the blur. */
  readonly preview: ReactNode;
}

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
// Builds made before expo-blur was added dim the conversation instead.
const canBlur = requireOptionalNativeModule("ExpoBlur") !== null;

const GAP = 10;
const EDGE = 12;
/** How much the lifted message grows. */
const LIFT = 0.035;
/** The card around lifted plain text reaches this far past it. */
const CARD_INSET = { x: 10, y: 8 };
const OPEN_SPRING = { damping: 19, mass: 0.9, stiffness: 230 };

interface Layout {
  /** How far the message moves so the bar and menu fit on screen. */
  readonly shift: number;
  readonly barTop: number;
  readonly barLeft: number;
  readonly menuTop: number;
  readonly menuLeft: number;
}

/** What lifts: the message, or the card around it. */
function frameOf(target: MenuTarget) {
  const { rect, shape } = target;
  if (shape === "bubble") return rect;
  return {
    height: rect.height + CARD_INSET.y * 2,
    width: rect.width + CARD_INSET.x * 2,
    x: rect.x - CARD_INSET.x,
    y: rect.y - CARD_INSET.y,
  };
}

function layoutFor(
  target: MenuTarget,
  screen: { height: number; width: number },
  insets: { bottom: number; top: number },
  menuHeight: number,
) {
  const { align } = target;
  const rect = frameOf(target);
  const minTop = insets.top + EDGE + BAR_HEIGHT + GAP;
  const maxBottom =
    screen.height - insets.bottom - EDGE - (menuHeight > 0 ? menuHeight + GAP : 0);
  // Keep the message between the bar and the menu; the top wins when tall.
  const top = Math.max(minTop, Math.min(rect.y, maxBottom - rect.height));
  function side(width: number) {
    return clamp(
      align === "end" ? rect.x + rect.width - width : rect.x,
      EDGE,
      screen.width - width - EDGE,
    );
  }
  return {
    barLeft: side(BAR_WIDTH),
    barTop: top - GAP - BAR_HEIGHT,
    menuLeft: side(MENU_WIDTH),
    menuTop: top + rect.height + GAP,
    shift: top - rect.y,
  } satisfies Layout;
}

/** The conversation behind the lifted message: blurred and dimmed. */
function Backdrop({
  progress,
  onPress,
}: {
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const { theme } = useUniwind();
  const dim = useAnimatedStyle(() => ({
    opacity: clamp(progress.value, 0, 1),
  }));
  const blur = useAnimatedProps(() => ({
    intensity: clamp(progress.value, 0, 1) * 28,
  }));
  return (
    <Pressable
      accessibilityLabel="Close"
      className="absolute inset-0"
      onPress={onPress}
    >
      {canBlur && (
        <AnimatedBlurView
          animatedProps={blur}
          tint={theme === "dark" ? "dark" : "light"}
          className="absolute inset-0"
        />
      )}
      <Animated.View
        className={cn(
          "absolute inset-0",
          canBlur ? "bg-black/10 dark:bg-black/35" : "bg-black/30",
        )}
        style={dim}
      />
    </Pressable>
  );
}

function Lifted({
  target,
  shift,
  progress,
}: {
  target: MenuTarget;
  shift: number;
  progress: SharedValue<number>;
}) {
  const rect = frameOf(target);
  const card = target.shape === "card";
  const style = useAnimatedStyle(() => ({
    shadowOpacity: clamp(progress.value, 0, 1) * 0.22,
    transform: [
      { translateY: shift * progress.value },
      { scale: 1 + LIFT * progress.value },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      className={cn(
        "absolute",
        card && "bg-background-elevated rounded-[16px]",
      )}
      style={[
        {
          height: rect.height,
          left: rect.x,
          shadowOffset: { height: 8, width: 0 },
          shadowRadius: 18,
          top: rect.y,
          width: rect.width,
        },
        card && { paddingHorizontal: CARD_INSET.x, paddingVertical: CARD_INSET.y },
        style,
      ]}
    >
      <LiftedContext value>{target.preview}</LiftedContext>
    </Animated.View>
  );
}

/**
 * The iMessage-style long-press overlay: the conversation blurs, the message
 * lifts, a Liquid Glass reaction bar springs out above it and the actions
 * below. Closing plays it all back into place.
 */
export function GlassMessageMenu({
  target,
  onReact,
  onClosed,
}: {
  target: MenuTarget;
  onReact: (emoji: string) => void;
  onClosed: () => void;
}) {
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { body } = target.message;
  const copyable = canCopy && body !== undefined && body !== "";
  const layout = layoutFor(
    target,
    screen,
    insets,
    copyable ? MENU_HEIGHT : 0,
  );
  const progress = useSharedValue(0);
  useAnimatedReaction(
    () => true,
    (_, previous) => {
      if (previous === null) progress.value = withSpring(1, OPEN_SPRING);
    },
  );

  function close() {
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

  return (
    <Modal transparent visible animationType="none" onRequestClose={close}>
      <Backdrop progress={progress} onPress={close} />
      <Lifted target={target} shift={layout.shift} progress={progress} />
      <ReactionBar
        target={target}
        progress={progress}
        position={{ left: layout.barLeft, top: layout.barTop }}
        onPick={(emoji) => {
          selectionTick();
          onReact(emoji);
          close();
        }}
      />
      {copyable && (
        <ActionMenu
          progress={progress}
          align={target.align}
          position={{ left: layout.menuLeft, top: layout.menuTop }}
          onCopy={() => {
            copyText(body);
            close();
          }}
        />
      )}
    </Modal>
  );
}
