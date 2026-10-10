import type { TextInputProps } from "@expo/ui";
import { TextInput as UITextInput } from "@expo/ui";
import { useCSSVariable } from "uniwind";

/**
 * `@expo/ui`'s text field with a muted placeholder. Compose draws the
 * placeholder in the text color unless told otherwise, so on Android it
 * looked like typed text; SwiftUI already dims it.
 */
export function TextInput(props: TextInputProps) {
  const muted = useCSSVariable("--color-muted");
  return (
    <UITextInput
      placeholderTextColor={typeof muted === "string" ? muted : undefined}
      {...props}
    />
  );
}
