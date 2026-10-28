import type { ComponentProps, RefObject } from "react";
import { TextInput } from "react-native";
import { withUniwind } from "uniwind";

import { PASTE_IMAGES_NATIVE_ID } from "~/lib/paste-images";
import { useFieldText } from "./field-text";

const StyledTextInput = withUniwind(TextInput);

function ignore() {
  // Typing while dictating changes nothing.
}

/**
 * The composer's text field. While dictating (`idle` false) the keyboard
 * stays up, but typing does nothing: the field puts its text back.
 */
export function MessageInput({
  input,
  draft,
  idle,
  microphone,
  hint,
  onChangeText,
  ...props
}: Pick<
  ComponentProps<typeof TextInput>,
  "onBlur" | "onFocus" | "onSelectionChange"
> & {
  input: RefObject<TextInput | null>;
  draft: string;
  /** Not dictating, so typing changes the text. */
  idle: boolean;
  /** The field leaves room for dictation's microphone (`useFieldText`). */
  microphone: boolean;
  hint: string;
  onChangeText: (text: string) => void;
}) {
  const fieldText = useFieldText(draft, microphone);
  return (
    <StyledTextInput
      ref={input}
      nativeID={PASTE_IMAGES_NATIVE_ID}
      {...props}
      multiline
      value={draft}
      onChangeText={idle ? onChangeText : ignore}
      placeholder={hint}
      accessibilityLabel="Message"
      // A message field never needs AutoFill suggestions.
      autoComplete="off"
      textContentType="none"
      className="text-body text-foreground pl-4"
      {...fieldText}
      placeholderTextColorClassName="accent-muted"
      cursorColorClassName="accent-accent"
    />
  );
}
