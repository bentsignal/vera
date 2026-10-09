import type { ListItemProps } from "@expo/ui";
import { ListItem as UIListItem } from "@expo/ui";

import { nestedListItemColors } from "~/lib/ui-modifiers";

/**
 * A `ListItem` row in a `FieldGroup.Section`. On Android the section
 * already draws each row as a rounded Material list segment, so the row's
 * own container is transparent; with Compose's default it painted a
 * square box inside every segment. iOS ignores `colors`.
 */
export function ListItem(props: ListItemProps) {
  return <UIListItem colors={nestedListItemColors} {...props} />;
}
