import { ActivityIndicator } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useCSSVariable } from "uniwind";

import type { useDictationField } from "./field";
import type { DictationPhase } from "./session";
import { GesturePressable } from "~/components/gesture-pressable";
import { SymbolIcon } from "~/components/symbol-icon";
import { Waveform } from "./waveform";

/**
 * What the message field shows while dictating, a line tall: cancel on
 * the left, the waveform, and confirm on the right, where send is, which
 * turns into a spinner while the last words are transcribed.
 */
export function DictationControls({
  phase,
  height,
  button,
  style,
  onCancel,
  onConfirm,
}: {
  phase: DictationPhase;
  /** The field's height at a line. */
  height: number;
  /** The buttons' size, the send button's. */
  button: number;
  /** Fades them in and out (see `useDictationField`). */
  style: ReturnType<typeof useDictationField>["controls"];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const onAccent = useCSSVariable("--color-on-accent");
  return (
    <Animated.View
      pointerEvents={phase === "recording" ? "box-none" : "none"}
      className="absolute right-0 bottom-0 left-0 flex-row items-center gap-3"
      style={[{ height, paddingHorizontal: (height - button) / 2 }, style]}
    >
      <GesturePressable
        accessibilityRole="button"
        accessibilityLabel="Cancel Dictation"
        onPress={onCancel}
        hitSlop={6}
        className="bg-fill items-center justify-center rounded-full"
        pressedClassName="opacity-70"
        style={{ height: button, width: button }}
      >
        <SymbolIcon
          name={{ android: "close", ios: "xmark" }}
          size={13}
          weight="bold"
          tintColorClassName="accent-muted"
        />
      </GesturePressable>
      <Waveform />
      <GesturePressable
        accessibilityRole="button"
        accessibilityLabel="Done Dictating"
        accessibilityState={{ busy: phase === "finishing" }}
        onPress={onConfirm}
        hitSlop={6}
        className="bg-accent items-center justify-center rounded-full"
        pressedClassName="opacity-80"
        style={{ height: button, width: button }}
      >
        {phase === "finishing" ? (
          <Animated.View
            key="spinner"
            entering={FadeIn.duration(120)}
            exiting={FadeOut.duration(100)}
          >
            <ActivityIndicator
              size="small"
              color={typeof onAccent === "string" ? onAccent : "white"}
            />
          </Animated.View>
        ) : (
          <Animated.View
            key="check"
            entering={FadeIn.duration(120)}
            exiting={FadeOut.duration(100)}
          >
            <SymbolIcon
              name={{ android: "check", ios: "checkmark" }}
              size={15}
              weight="bold"
              tintColorClassName="accent-on-accent"
            />
          </Animated.View>
        )}
      </GesturePressable>
    </Animated.View>
  );
}
