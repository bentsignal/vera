import { useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { withUniwind } from "uniwind";

import { GlassSurface } from "~/components/glass-surface";
import { SymbolIcon } from "~/components/symbol-icon";
import { cn } from "~/lib/cn";

const StyledTextInput = withUniwind(TextInput);
/** Every control in the composer shares this height so they line up. */
const CONTROL = 40;
const SEND = 32;

function SendButton({
  visible,
  onPress,
}: {
  visible: boolean;
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        onPress={onPress}
        className="bg-accent items-center justify-center rounded-full active:opacity-80"
        style={{ height: SEND, width: SEND }}
      >
        <SymbolIcon
          name={{ android: "arrow_upward", ios: "arrow.up" }}
          size={15}
          weight="bold"
          tintColorClassName="accent-on-accent"
        />
      </Pressable>
    </Animated.View>
  );
}

export function Composer({
  onSend,
  onAttach,
}: {
  onSend: (text: string) => void;
  onAttach: () => void;
}) {
  const [draft, setDraft] = useState("");
  const canSend = draft.trim().length > 0;

  function send() {
    if (!canSend) return;
    onSend(draft.trim());
    setDraft("");
  }

  return (
    <View
      className={cn(
        "flex-row items-end gap-2 px-3 pt-2 pb-2",
        // No glass on Android: a solid bar keeps messages from showing
        // through behind the field.
        Platform.OS === "android" && "bg-background border-separator",
      )}
      style={
        Platform.OS === "android"
          ? { borderTopWidth: StyleSheet.hairlineWidth }
          : undefined
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add attachment"
        onPress={onAttach}
      >
        <GlassSurface
          isInteractive
          className="items-center justify-center rounded-full"
          style={{ height: CONTROL, width: CONTROL }}
        >
          <SymbolIcon
            name={{ android: "add", ios: "plus" }}
            size={18}
            weight="semibold"
            tintColorClassName="accent-foreground"
          />
        </GlassSurface>
      </Pressable>
      <GlassSurface
        className="flex-1 justify-center rounded-[20px]"
        style={{ minHeight: CONTROL }}
      >
        <StyledTextInput
          multiline
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          accessibilityLabel="Message"
          // A message field never needs AutoFill suggestions.
          autoComplete="off"
          textContentType="none"
          className="text-body text-foreground max-h-32 pl-4"
          // The send button floats over this padding, so text never jumps.
          style={{ paddingBottom: 9, paddingRight: SEND + 12, paddingTop: 9 }}
          placeholderTextColorClassName="accent-muted"
          cursorColorClassName="accent-accent"
        />
        <SendButton visible={canSend} onPress={send} />
      </GlassSurface>
    </View>
  );
}
