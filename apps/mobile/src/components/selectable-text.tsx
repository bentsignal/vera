import { Text } from "@expo/ui";
import { textSelection } from "@expo/ui/swift-ui/modifiers";

/**
 * Text you can long-press to copy (iOS copies it whole);
 * `selectable-text.android.tsx` lets you select any part.
 */
export function SelectableText({ children }: { children: string }) {
  return <Text modifiers={[textSelection(true)]}>{children}</Text>;
}
