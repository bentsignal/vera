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

import type {
  MenuTarget,
  PreviewShape,
  TargetAlign,
} from "./glass-message-menu";
import type { Message } from "./types";
import { impact } from "~/lib/native-extras";
import { GlassMessageMenu } from "./glass-message-menu";

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
 * Long-press actions for the messages below: the glass reaction overlay,
 * reaction toggles for the chips, and the sheet of who reacted.
 */
export function MessageActionsProvider({
  onToggleReaction,
  onViewReactions,
  children,
}: {
  onToggleReaction: (messageId: string, emoji: string) => void;
  onViewReactions: (messageId: string) => void;
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
          onViewReactions={() => onViewReactions(target.message.id)}
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

/** A message that opens the glass reaction overlay on a long press. */
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
  return (
    <GlassLongPress message={message} align={align} shape={shape}>
      {children}
    </GlassLongPress>
  );
}
