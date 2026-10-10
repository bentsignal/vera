import { Text } from "@expo/ui";
import {
  Box,
  CircularProgressIndicator,
  useMaterialColors,
} from "@expo/ui/jetpack-compose";
import { alpha, size } from "@expo/ui/jetpack-compose/modifiers";

import { fillWidth } from "~/lib/ui-modifiers";
import { LABEL_STYLE } from "./prominent-button-style";

/**
 * Android `ProminentButtonLabel`: the label, or a circular indicator in the
 * button's content color over the invisible label. See
 * `prominent-button-label.tsx`.
 */
export function ProminentButtonLabel({
  label,
  loading,
  variant,
}: {
  label: string;
  loading: boolean;
  variant: "filled" | "secondary" | "text";
}) {
  const colors = useMaterialColors();
  if (!loading) {
    return (
      <Text modifiers={fillWidth} textStyle={LABEL_STYLE}>
        {label}
      </Text>
    );
  }
  return (
    <Box contentAlignment="center" modifiers={fillWidth}>
      <Text modifiers={[...fillWidth, alpha(0)]} textStyle={LABEL_STYLE}>
        {label}
      </Text>
      <CircularProgressIndicator
        color={variant === "filled" ? colors.onPrimary : colors.primary}
        strokeWidth={2.5}
        modifiers={[size(20, 20)]}
      />
    </Box>
  );
}
