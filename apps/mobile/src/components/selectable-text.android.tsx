import { TextInput } from "@expo/ui";

/**
 * Text you can select any part of and copy. Compose text isn't selectable
 * on its own, so this is a read-only text field.
 */
export function SelectableText({ children }: { children: string }) {
  return <TextInput defaultValue={children} editable={false} />;
}
