import { useState } from "react";
import { TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Icon } from "@expo/ui";
import { withUniwind } from "uniwind";

import { NativeHost } from "~/components/native-host";
import { circleButton, circleProminentButton } from "~/lib/ui-modifiers";

const StyledTextInput = withUniwind(TextInput);

const ATTACH_ICON = Icon.select({
  ios: "plus",
  android: import("@expo/material-symbols/add.xml"),
});
const SEND_ICON = Icon.select({
  ios: "arrow.up",
  android: import("@expo/material-symbols/arrow_upward.xml"),
});

export function Composer({
  onSend,
  onAttach,
  keyboardVisible,
}: {
  onSend: (text: string) => void;
  onAttach: () => void;
  keyboardVisible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const canSend = draft.trim().length > 0;

  function send() {
    onSend(draft.trim());
    setDraft("");
  }

  return (
    <View
      className="flex-row items-end gap-2 px-3 pt-2"
      style={{
        paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 8),
      }}
    >
      <NativeHost matchContents>
        <Button variant="outlined" modifiers={circleButton} onPress={onAttach}>
          <Icon name={ATTACH_ICON} size={18} />
        </Button>
      </NativeHost>
      <View className="border-hairline border-separator bg-background-elevated min-h-11 flex-1 flex-row items-end rounded-[22px] py-1 pr-1 pl-4">
        <StyledTextInput
          multiline
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          accessibilityLabel="Message"
          className="text-body text-foreground max-h-32 flex-1 py-1.5"
          placeholderTextColorClassName="accent-muted"
          cursorColorClassName="accent-accent"
        />
        {canSend && (
          <NativeHost matchContents>
            <Button
              variant="filled"
              modifiers={circleProminentButton}
              onPress={send}
            >
              <Icon name={SEND_ICON} size={16} />
            </Button>
          </NativeHost>
        )}
      </View>
    </View>
  );
}
