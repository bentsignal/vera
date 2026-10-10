import type { ReactNode } from "react";
import { Column } from "@expo/ui/jetpack-compose";
import { fillMaxWidth, padding } from "@expo/ui/jetpack-compose/modifiers";

/**
 * Android `PeopleSections`: one Compose column with no spacing of its own,
 * so an empty section in it takes no room. Sections space themselves with
 * `sectionGap`. See `people-sections.tsx`.
 */
export function PeopleSections({ children }: { children: ReactNode }) {
  return <Column modifiers={[fillMaxWidth()]}>{children}</Column>;
}

/**
 * Always: unmounting the picked-people section when its last person was
 * unchecked crashed the app in Compose ("The specified child already has a
 * parent"). An empty section draws nothing, so it stays mounted instead.
 */
export function showsPickedSection(_count: number) {
  return true;
}

/** Space below a section, matching `FieldList`'s 24dp between items. */
export const sectionGap = [padding(0, 0, 0, 24)];
