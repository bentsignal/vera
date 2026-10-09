import type { ListItemProps } from "@expo/ui";
import { ListItem as UIListItem } from "@expo/ui";
import { clickable, clip, Shapes } from "@expo/ui/jetpack-compose/modifiers";

import { nestedListItemColors } from "~/lib/ui-modifiers";

/** Rounds the pressed highlight, which Compose would draw square. */
const PRESS_SHAPE = clip(Shapes.RoundedCorner(12));

/**
 * Android `ListItem`: transparent inside its section segment (see
 * `list-item.tsx`), and clipped before it takes taps so the pressed
 * highlight has rounded corners like the segment around it.
 */
export function ListItem({ onPress, modifiers, ...props }: ListItemProps) {
  return (
    <UIListItem
      colors={nestedListItemColors}
      {...props}
      modifiers={[
        PRESS_SHAPE,
        ...(onPress ? [clickable(onPress)] : []),
        ...(modifiers ?? []),
      ]}
    />
  );
}
