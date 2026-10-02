import { Button, Text } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { fillWidth, linkButton, prominentButton } from "~/lib/ui-modifiers";

/** A full-width, large native button for a screen's primary action. */
export function ProminentButton({
  label,
  onPress,
  disabled,
  variant = "filled",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "filled" | "text";
}) {
  return (
    <NativeHost matchContents={{ vertical: true }}>
      <Button
        variant={variant}
        onPress={onPress}
        disabled={disabled}
        modifiers={variant === "filled" ? prominentButton : linkButton}
      >
        <Text
          modifiers={fillWidth}
          textStyle={{ fontSize: 17, fontWeight: "600", textAlign: "center" }}
        >
          {label}
        </Text>
      </Button>
    </NativeHost>
  );
}
