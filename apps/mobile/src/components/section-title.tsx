import { Text } from "@expo/ui";

/**
 * A section heading written as a `FieldGroup.SectionHeader` child. iOS
 * styles header text itself; `section-title.android.tsx` matches the
 * headings Compose draws for a section's `title`.
 */
export function SectionTitle({ children }: { children: string }) {
  return <Text>{children}</Text>;
}
