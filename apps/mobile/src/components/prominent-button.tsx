import { Button } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import {
  linkButton,
  prominentButton,
  secondaryButton,
} from "~/lib/ui-modifiers";
import { ProminentButtonLabel } from "./prominent-button-label";

const MODIFIERS = {
  filled: prominentButton,
  secondary: secondaryButton,
  text: linkButton,
};

/**
 * A full-width, large native button: `filled` for a screen's primary
 * action, `secondary` for the one beside it, `text` for a quiet link.
 * While `loading`, a spinner replaces the label and taps do nothing; the
 * button keeps its color rather than graying out like a disabled one.
 */
export function ProminentButton({
  label,
  onPress,
  disabled,
  loading = false,
  variant = "filled",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "filled" | "secondary" | "text";
}) {
  return (
    <NativeHost matchContents={{ vertical: true }}>
      <Button
        variant={variant === "secondary" ? "outlined" : variant}
        onPress={() => {
          if (!loading) onPress();
        }}
        disabled={disabled}
        modifiers={MODIFIERS[variant]}
      >
        <ProminentButtonLabel
          label={label}
          loading={loading}
          variant={variant}
        />
      </Button>
    </NativeHost>
  );
}
