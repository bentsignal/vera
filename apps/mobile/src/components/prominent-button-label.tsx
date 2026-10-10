import { Text } from "@expo/ui";
import { ProgressView, ZStack } from "@expo/ui/swift-ui";
import { controlSize, opacity, tint } from "@expo/ui/swift-ui/modifiers";

import { fillWidth } from "~/lib/ui-modifiers";
import { LABEL_STYLE } from "./prominent-button-style";

/**
 * A `ProminentButton`'s label, or a spinner in its place. The label stays
 * underneath, invisible, so the button keeps its size. Android draws its
 * own in `prominent-button-label.android.tsx`.
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
  if (!loading) {
    return (
      <Text modifiers={fillWidth} textStyle={LABEL_STYLE}>
        {label}
      </Text>
    );
  }
  return (
    <ZStack modifiers={fillWidth}>
      <Text modifiers={[...fillWidth, opacity(0)]} textStyle={LABEL_STYLE}>
        {label}
      </Text>
      {/* Regular, about the label's capital height: a large button would
          make it large, taller than the label. White like a filled
          button's label; elsewhere, gray. */}
      <ProgressView
        modifiers={[
          controlSize("regular"),
          ...(variant === "filled" ? [tint("white")] : []),
        ]}
      />
    </ZStack>
  );
}
