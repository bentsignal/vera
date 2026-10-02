import type { ReactNode } from "react";
import type { View as NativeView } from "react-native";
import { createContext, use, useRef, useState } from "react";
import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import type { MenuTarget, TargetAlign } from "./glass-message-menu";
import type { PreviewShape } from "./native-message-menu";
import type { Message } from "./types";
import { usePreference } from "~/features/preferences/store";
import { impact, selectionTick } from "~/lib/native-extras";
import { GlassMessageMenu } from "./glass-message-menu";
import { hasNativeMessageMenu, NativeMessageMenu } from "./native-message-menu";

interface MessageActions {
  readonly open: (target: MenuTarget) => void;
  readonly toggleReaction: (messageId: string, emoji: string) => void;
}

const MessageActionsContext = createContext<MessageActions | null>(null);

export function useMessageActions() {
  const actions = use(MessageActionsContext);
  if (actions === null) {
    throw new Error("Messages must render inside MessageActionsProvider");
  }
  return actions;
}

/**
 * Long-press actions for the messages below: the glass reaction overlay
 * (the native menu presents itself) and reaction toggles for the badges.
 */
export function MessageActionsProvider({
  onToggleReaction,
  children,
}: {
  onToggleReaction: (messageId: string, emoji: string) => void;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<MenuTarget | null>(null);
  return (
    <MessageActionsContext
      value={{ open: setTarget, toggleReaction: onToggleReaction }}
    >
      {children}
      {target !== null && (
        <GlassMessageMenu
          target={target}
          onReact={(emoji) => onToggleReaction(target.message.id, emoji)}
          onClosed={() => setTarget(null)}
        />
      )}
    </MessageActionsContext>
  );
}

/** Press-and-hold squeezes the message a little, as iOS does. */
const PRESS_SCALE = 0.96;
const LONG_PRESS_MS = 320;

/**
 * Opens the glass overlay on a long press, lifting a copy of `children`
 * from where the message sits.
 */
function GlassLongPress({
  message,
  align,
  shape,
  children,
}: {
  message: Message;
  align: TargetAlign;
  shape: PreviewShape;
  children: ReactNode;
}) {
  const { open } = useMessageActions();
  const ref = useRef<NativeView>(null);
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Pressable
      ref={ref}
      delayLongPress={LONG_PRESS_MS}
      disabled={message.status !== undefined}
      onPressIn={() => {
        scale.set(withTiming(PRESS_SCALE, { duration: LONG_PRESS_MS }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 14, stiffness: 320 }));
      }}
      onLongPress={() => {
        impact();
        scale.set(withSpring(1, { damping: 14, stiffness: 320 }));
        ref.current?.measureInWindow((x, y, width, height) =>
          open({
            align,
            message,
            preview: children,
            rect: { height, width, x, y },
            shape,
          }),
        );
      }}
    >
      <Animated.View style={style}>{children}</Animated.View>
    </Pressable>
  );
}

/**
 * A message that opens its actions on a long press, as the Experiments
 * setting picks: the system context menu or the glass overlay.
 */
export function LongPressMessage({
  message,
  align,
  shape,
  children,
}: {
  message: Message;
  /** Which side the message sits on; the reaction bar lines up with it. */
  align: TargetAlign;
  shape: PreviewShape;
  children: ReactNode;
}) {
  const press = usePreference("pressExperiment");
  const { toggleReaction } = useMessageActions();
  if (press === "menu" && hasNativeMessageMenu) {
    return (
      <NativeMessageMenu
        message={message}
        shape={shape}
        onReact={(emoji) => {
          selectionTick();
          toggleReaction(message.id, emoji);
        }}
      >
        {children}
      </NativeMessageMenu>
    );
  }
  return (
    <GlassLongPress message={message} align={align} shape={shape}>
      {children}
    </GlassLongPress>
  );
}
