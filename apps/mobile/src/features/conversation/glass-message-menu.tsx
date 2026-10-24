import type { ReactNode } from "react";
import type { SharedValue } from "react-native-reanimated";
import { Modal, Pressable, useWindowDimensions } from "react-native";
import Animated, {
  clamp,
  LayoutAnimationConfig,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { requireOptionalNativeModule } from "expo";
import { BlurView } from "expo-blur";
import { useUniwind } from "uniwind";

import type { MessageHandlers } from "./menu-actions";
import type { MenuLayout, Rect } from "./menu-layout";
import type { Message, MessageAttachment } from "./types";
import type { ReactionPart } from "~/features/messaging/reactions";
import { cn } from "~/lib/cn";
import { selectionTick } from "~/lib/native-extras";
import {
  ActionMenu,
  BAR_HEIGHT,
  BAR_WIDTH,
  MENU_WIDTH,
  menuHeight,
  ReactionBar,
} from "./glass-menu-parts";
import { menuActions, targetReactions } from "./menu-actions";
import { EDGE, menuLayout } from "./menu-layout";
import { menuTitleHeight } from "./menu-title";
import { REACTORS_HEIGHT, reactorsWidth } from "./reactor-rows";
import { Reactors } from "./reactors";
import { useMenuClosing } from "./use-menu-closing";

export type TargetAlign = "end" | "start";

/** Most things lift as they are; plain (stacked) text lifts on a card. */
export type PreviewShape = "card" | "plain";

/** What a long press opened, and where it sits on screen. */
export interface MenuTarget {
  readonly message: Message;
  /** The part of it held, which reactions picked go to. */
  readonly part: ReactionPart;
  /** Where the held element (a bubble, a link card) sits on screen. */
  readonly rect: Rect;
  readonly align: TargetAlign;
  readonly shape: PreviewShape;
  /** The held element as drawn in the list, lifted above the blur. */
  readonly preview: ReactNode;
  /** The link whose card was held, which the menu is about. */
  readonly link?: string;
  /** The photo, video, or file that was held, which the menu can save. */
  readonly attachment?: MessageAttachment;
  /**
   * `actions` under the message (a long press), or who reacted
   * (`reactions`: a double tap, or tapping its tapbacks).
   */
  readonly mode: "actions" | "reactions";
  /**
   * The native list lifts the held message itself (its `lift`), so the
   * menu draws no copy of it: it says where the message goes as it opens
   * (`onLift`), and `onLand` as it starts closing, when the message plays
   * back into place with it.
   */
  readonly lift?: {
    readonly onLift: (layout: MenuLayout) => void;
    readonly onLand: () => void | Promise<void>;
  };
}

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
// Builds made before expo-blur was added dim the conversation instead.
const canBlur = requireOptionalNativeModule("ExpoBlur") !== null;

/** The card around lifted plain text reaches this far past it. */
const CARD_INSET = { x: 10, y: 8 };
const OPEN_SPRING = { damping: 19, mass: 0.9, stiffness: 230 };

/** What lifts: the element, or the card around it. */
function frameOf(target: MenuTarget) {
  const { rect, shape } = target;
  if (shape === "plain") return rect;
  return {
    height: rect.height + CARD_INSET.y * 2,
    width: rect.width + CARD_INSET.x * 2,
    x: rect.x - CARD_INSET.x,
    y: rect.y - CARD_INSET.y,
  };
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
  layout,
  progress,
}: {
  target: MenuTarget;
  layout: MenuLayout;
  progress: SharedValue<number>;
}) {
  const rect = frameOf(target);
  const card = target.shape === "card";
  const { scale, shift } = layout;
  // Its top corner on its side stays put, so it lines up with the bar and
  // the actions however much it grows or shrinks. One as wide as the
  // conversation grows from its middle, staying on screen.
  const corner = target.align === "end" ? "right" : "left";
  const origin = `${layout.fromMiddle ? "center" : corner} top`;
  const style = useAnimatedStyle(() => ({
    shadowOpacity: clamp(progress.value, 0, 1) * 0.22,
    transform: [
      { translateY: shift * progress.value },
      { scale: 1 + (scale - 1) * progress.value },
    ],
    transformOrigin: origin,
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
        card && {
          paddingHorizontal: CARD_INSET.x,
          paddingVertical: CARD_INSET.y,
        },
        style,
      ]}
    >
      {/* Shown as it is in the list, without fading in again. */}
      <LayoutAnimationConfig skipEntering>
        {target.preview}
      </LayoutAnimationConfig>
    </Animated.View>
  );
}

/** The size of what goes under the lifted message: who reacted, or actions. */
function belowSize(target: MenuTarget, actions: number, reactorsMax: number) {
  if (target.mode === "reactions") {
    return {
      height: REACTORS_HEIGHT,
      width: reactorsWidth(targetReactions(target), reactorsMax),
    };
  }
  return {
    height: menuHeight(actions) + menuTitleHeight(target.link),
    width: MENU_WIDTH,
  };
}

/**
 * How far open the menu is, springing open as it mounts. A message the
 * native list lifts itself (`onLift`) is sent where to go then, so it
 * springs there with the menu.
 */
function useOpening(
  layout: MenuLayout,
  onLift: ((layout: MenuLayout) => void) | undefined,
) {
  const progress = useSharedValue(0);
  useAnimatedReaction(
    () => true,
    (_, previous) => {
      if (previous !== null) return;
      progress.set(withSpring(1, OPEN_SPRING));
      if (onLift !== undefined) scheduleOnRN(onLift, layout);
    },
  );
  return progress;
}

/**
 * The iMessage-style overlay: the conversation blurs, the message lifts, a
 * Liquid Glass reaction bar springs out above it, and below it the actions
 * (a long press) or who reacted (a double tap, or its tapbacks). Closing
 * plays it all back into place.
 */
export function GlassMessageMenu({
  target,
  onReact,
  onViewReactions,
  handlers,
  onClosing,
  onClosed,
}: {
  target: MenuTarget;
  onReact: (emoji: string) => void;
  /** Opens the sheet of who reacted with what, on one emoji if given. */
  onViewReactions: (emoji?: string) => void;
  /** Reply in a conversation (not a thread); Edit and Delete on yours. */
  handlers: MessageHandlers;
  /** The overlay starts playing back into place. */
  onClosing?: () => void;
  /**
   * The overlay is gone. `backToChat` unless it opened something else (a
   * sheet, a link, sharing), so the keyboard can come back if it was up.
   */
  onClosed: (backToChat: boolean) => void;
}) {
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const showReactors = target.mode === "reactions";
  const reactions = targetReactions(target);
  const reactorsMax = screen.width - EDGE * 2;
  const actions = showReactors
    ? []
    : menuActions(target, { ...handlers, close, onViewReactions });
  const layout = menuLayout({
    align: target.align,
    bar: { height: BAR_HEIGHT, width: BAR_WIDTH },
    frame: frameOf(target),
    insets,
    menu: belowSize(target, actions.length, reactorsMax),
    screen,
  });
  const progress = useOpening(layout, target.lift?.onLift);
  const menuClose = useMenuClosing(progress, target, onClosing, onClosed);
  const { closing } = menuClose;

  /**
   * Plays the overlay back into place, then runs `then`. Back to the chat
   * unless `then` opens something else; reacting stays in the chat.
   */
  function close(then?: () => void, toChat?: boolean) {
    menuClose.close(then, toChat);
  }

  return (
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={() => close()}
    >
      <Backdrop progress={progress} onPress={() => close()} />
      {target.lift === undefined && (
        <Lifted target={target} layout={layout} progress={progress} />
      )}
      <ReactionBar
        target={target}
        progress={progress}
        closing={closing}
        position={{ left: layout.barLeft, top: layout.barTop }}
        onPick={(emoji) => {
          selectionTick();
          // Once the message is back in place, so its reaction animates in
          // where you can see it, and the lifted copy never covers the
          // message while the row makes room for the reaction.
          close(() => onReact(emoji), true);
        }}
      />
      {showReactors && reactions.length > 0 && (
        <Reactors
          reactions={reactions}
          progress={progress}
          closing={closing}
          align={target.align}
          position={{ left: layout.menuLeft, top: layout.menuTop }}
          width={reactorsWidth(reactions, reactorsMax)}
          onPick={(emoji) => close(() => onViewReactions(emoji))}
        />
      )}
      {actions.length > 0 && (
        <ActionMenu
          progress={progress}
          closing={closing}
          align={target.align}
          position={{ left: layout.menuLeft, top: layout.menuTop }}
          title={target.link}
          actions={actions}
        />
      )}
    </Modal>
  );
}
