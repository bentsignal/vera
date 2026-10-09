import { Text, useMaterialColors } from "@expo/ui/jetpack-compose";

/**
 * Android `SectionTitle`: the type and color `FieldGroup.Section` uses for
 * its `title`, which custom headers don't get. See `section-title.tsx`.
 */
export function SectionTitle({ children }: { children: string }) {
  const colors = useMaterialColors();
  return (
    <Text color={colors.onSurfaceVariant} style={{ typography: "titleMedium" }}>
      {children}
    </Text>
  );
}
