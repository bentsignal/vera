import type { SymbolViewProps } from "expo-symbols";
import { Text } from "@expo/ui";

import { ListItem } from "~/components/list-item";
import { SymbolIcon } from "~/components/symbol-icon";

/**
 * A row in a `FieldGroup.Section` that opens another screen: an accent
 * icon, its label, and a chevron.
 */
export function NavigationRow({
  icon,
  label,
  onPress,
}: {
  icon: SymbolViewProps["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <ListItem
      leading={
        <SymbolIcon name={icon} size={20} tintColorClassName="accent-accent" />
      }
      trailing={
        <SymbolIcon
          name={{ android: "chevron_right", ios: "chevron.right" }}
          size={14}
          weight="semibold"
          tintColorClassName="accent-subtle"
        />
      }
      onPress={onPress}
    >
      <Text>{label}</Text>
    </ListItem>
  );
}
