import type { StyleProp, ViewStyle } from "react-native";
import type { AnimatedStyle } from "react-native-reanimated";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { GesturePressable } from "~/components/gesture-pressable";
import { SymbolIcon } from "~/components/symbol-icon";
import { CONTROL, MIC_SHIFT, SEND } from "./field-text";

// The buttons floating over the message field's right side.

function SendButton({
  visible,
  saves,
  onPress,
}: {
  visible: boolean;
  /** It saves an edit rather than sending. */
  saves: boolean;
  onPress: () => void;
}) {
  // Always mounted, so it never pops in below the field or resizes.
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, { duration: 120 }),
    transform: [{ scale: withTiming(visible ? 1 : 0.7, { duration: 140 }) }],
  }));
  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        { bottom: (CONTROL - SEND) / 2, position: "absolute", right: 4 },
        style,
      ]}
    >
      <GesturePressable
        accessibilityRole="button"
        accessibilityLabel={saves ? "Save" : "Send"}
        onPress={onPress}
        className="bg-accent items-center justify-center rounded-full"
        pressedClassName="opacity-80"
        style={{ height: SEND, width: SEND }}
      >
        <SymbolIcon
          name={
            saves
              ? { android: "check", ios: "checkmark" }
              : { android: "arrow_upward", ios: "arrow.up" }
          }
          size={15}
          weight="bold"
          tintColorClassName="accent-on-accent"
        />
      </GesturePressable>
    </Animated.View>
  );
}

/**
 * Dictation's microphone, where the send button goes while the field is
 * empty, and just left of it once there's something to send.
 */
function MicButton({
  beside,
  onPress,
}: {
  /** The send button is showing, so it moves aside. */
  beside: boolean;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: withTiming(beside ? -MIC_SHIFT : 0, {
          duration: 220,
          easing: Easing.out(Easing.cubic),
        }),
      },
    ],
  }));
  return (
    <Animated.View
      style={[
        { bottom: (CONTROL - SEND) / 2, position: "absolute", right: 4 },
        style,
      ]}
    >
      <GesturePressable
        accessibilityRole="button"
        accessibilityLabel="Dictate"
        onPress={onPress}
        className="items-center justify-center rounded-full"
        pressedClassName="opacity-60"
        style={{ height: SEND, width: SEND }}
      >
        <SymbolIcon
          name={{ android: "mic", ios: "mic" }}
          size={19}
          tintColorClassName="accent-muted"
        />
      </GesturePressable>
    </Animated.View>
  );
}

/**
 * Send (or save, for an edit), and dictation's microphone where this
 * phone has it, over the field's right padding. They fade out of the way
 * while dictating (`style`).
 */
export function FieldButtons({
  idle,
  style,
  canSend,
  saves,
  onSend,
  onDictate,
}: {
  /** Not dictating, so they can be tapped. */
  idle: boolean;
  style: StyleProp<AnimatedStyle<ViewStyle>>;
  canSend: boolean;
  saves: boolean;
  onSend: () => void;
  /** Where the phone can dictate. */
  onDictate: (() => void) | undefined;
}) {
  return (
    <Animated.View
      pointerEvents={idle ? "box-none" : "none"}
      style={[StyleSheet.absoluteFill, style]}
    >
      {onDictate !== undefined && (
        <MicButton beside={canSend} onPress={onDictate} />
      )}
      <SendButton visible={canSend} saves={saves} onPress={onSend} />
    </Animated.View>
  );
}
