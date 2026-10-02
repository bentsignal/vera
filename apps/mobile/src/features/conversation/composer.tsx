import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { GlassView } from "expo-glass-effect";
import { withUniwind } from "uniwind";

import { SymbolIcon } from "~/components/symbol-icon";

const StyledTextInput = withUniwind(TextInput);
const StyledGlassView = withUniwind(GlassView);

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
    transform: [{ scale: withSpring(visible ? 1 : 0.6, { damping: 18 }) }],
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
    <View className="flex-row items-end gap-2 px-3 pt-2 pb-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add attachment"
        onPress={onAttach}
      >
        <StyledGlassView
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
        </StyledGlassView>
      </Pressable>
      <StyledGlassView
        className="flex-1 justify-center rounded-[20px]"
        style={{ minHeight: CONTROL }}
      >
        <StyledTextInput
          multiline
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          accessibilityLabel="Message"
          className="text-body text-foreground max-h-32 pl-4"
          // The send button floats over this padding, so text never jumps.
          style={{ paddingBottom: 9, paddingRight: SEND + 12, paddingTop: 9 }}
          placeholderTextColorClassName="accent-muted"
          cursorColorClassName="accent-accent"
        />
        <SendButton visible={canSend} onPress={send} />
      </StyledGlassView>
    </View>
  );
}
