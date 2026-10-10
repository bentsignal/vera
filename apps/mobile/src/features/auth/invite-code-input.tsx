import { Fragment, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { cn } from "~/lib/cn";
import {
  INVITE_CODE_GROUP_LENGTH,
  INVITE_CODE_LENGTH,
  nextInviteCode,
} from "./invite-code";

const SLOT_GAP = 6;
const DASH_WIDTH = 24;
/** The section's margins and the row's padding on both sides. */
const ROW_INSET = 64;

const GROUPS = [0, INVITE_CODE_GROUP_LENGTH].map((start) =>
  Array.from({ length: INVITE_CODE_GROUP_LENGTH }, (_, index) => start + index),
);

/**
 * One box per character, split into the code's two groups with a dash the
 * user never types. A transparent field over the boxes takes the typing,
 * so the keyboard, long-press paste, and accessibility work as in any
 * field; the boxes only draw its value.
 */
export function InviteCodeInput({
  value,
  onChangeText,
  onComplete,
}: {
  /** Uppercase letters and digits, without the hyphen. */
  value: string;
  onChangeText: (value: string) => void;
  /** Called when the last character is typed or a whole code is pasted. */
  onComplete?: () => void;
}) {
  const { width } = useWindowDimensions();
  const [focused, setFocused] = useState(false);
  const slotWidth = Math.min(
    44,
    (width - ROW_INSET - DASH_WIDTH - SLOT_GAP * (INVITE_CODE_LENGTH - 2)) /
      INVITE_CODE_LENGTH,
  );
  const activeSlot = Math.min(value.length, INVITE_CODE_LENGTH - 1);

  function change(text: string) {
    const next = nextInviteCode(value, text);
    onChangeText(next);
    if (next.length === INVITE_CODE_LENGTH && next !== value) onComplete?.();
  }

  return (
    <View className="flex-row items-center py-1">
      {GROUPS.map((slots, group) => (
        <Fragment key={group}>
          {group > 0 && (
            <View className="items-center" style={{ width: DASH_WIDTH }}>
              <View className="bg-muted h-0.5 w-2.5 rounded-full" />
            </View>
          )}
          <View className="flex-row items-center" style={{ gap: SLOT_GAP }}>
            {slots.map((slot) => (
              <View
                key={slot}
                className={cn(
                  "bg-fill items-center justify-center rounded-lg border-2 border-transparent",
                  focused && slot === activeSlot && "border-accent",
                )}
                style={{
                  height: Math.round(slotWidth * 1.3),
                  width: slotWidth,
                }}
              >
                <Text className="text-foreground text-xl font-semibold">
                  {value[slot] ?? ""}
                </Text>
              </View>
            ))}
          </View>
        </Fragment>
      ))}
      <TextInput
        accessibilityLabel="Invite code"
        value={value}
        onChangeText={change}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCapitalize="characters"
        // No suggestions or AutoFill here or in the username field after
        // it, so iOS never shows the bar above the keyboard on one and
        // hides it on the other, which moved the Continue button.
        autoComplete="off"
        textContentType="none"
        autoCorrect={false}
        spellCheck={false}
        // Android's password keyboard is the one without suggestions.
        keyboardType={
          Platform.OS === "android" ? "visible-password" : "ascii-capable"
        }
        // iOS gets a transparent caret instead of `caretHidden`: it anchors
        // the long-press Paste menu to the caret, and a hidden one left
        // the menu nowhere to show.
        caretHidden={Platform.OS === "android"}
        selectionColor="transparent"
        style={styles.field}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // iOS doesn't deliver touches to an invisible view, which would break tap
  // and paste, so there only the text is transparent. Android draws the text
  // whatever its color, but does deliver touches to an invisible view.
  field: {
    ...StyleSheet.absoluteFill,
    ...Platform.select({
      android: { opacity: 0 },
      default: { color: "transparent" },
    }),
  },
});
