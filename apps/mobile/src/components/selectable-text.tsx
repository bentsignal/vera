import { Text } from "@expo/ui";
import { textSelection } from "@expo/ui/swift-ui/modifiers";

/**
 * Text you can long-press to copy. iOS copies the whole text (SwiftUI has
 * no partial selection on iOS); `selectable-text.android.tsx` lets you
 * select any part.
 */
export function SelectableText({ children }: { children: string }) {
  return <Text modifiers={[textSelection(true)]}>{children}</Text>;
}
