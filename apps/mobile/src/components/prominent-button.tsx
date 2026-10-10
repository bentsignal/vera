import { Button, Text } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import {
  fillWidth,
  linkButton,
  prominentButton,
  secondaryButton,
} from "~/lib/ui-modifiers";

const MODIFIERS = {
  filled: prominentButton,
  secondary: secondaryButton,
  text: linkButton,
};

/**
 * A full-width, large native button: `filled` for a screen's primary
 * action, `secondary` for the one beside it, `text` for a quiet link.
 */
export function ProminentButton({
  label,
  onPress,
  disabled,
  variant = "filled",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "filled" | "secondary" | "text";
}) {
  return (
    <NativeHost matchContents={{ vertical: true }}>
      <Button
        variant={variant === "secondary" ? "outlined" : variant}
        onPress={onPress}
        disabled={disabled}
        modifiers={MODIFIERS[variant]}
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
