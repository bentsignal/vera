import type { ReactNode } from "react";
import { Column } from "@expo/ui/jetpack-compose";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";

/**
 * Android `PeopleSections`: one Compose column with no spacing of its own,
 * so an empty section in it takes no room. Sections space themselves with
 * `sectionGap`. See `people-sections.tsx`.
 */
export function PeopleSections({ children }: { children: ReactNode }) {
  return <Column modifiers={[fillMaxWidth()]}>{children}</Column>;
}
