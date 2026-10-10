import type { ModifierConfig } from "@expo/ui/swift-ui/modifiers";
import type { ReactNode } from "react";

/**
 * Holds the picker's sections below its search field. On iOS they sit in
 * the form as they are; see `people-sections.android.tsx`.
 */
export function PeopleSections({ children }: { children: ReactNode }) {
  return children;
}

/** Whether to show the picked-people section, with `count` people in it. */
export function showsPickedSection(count: number) {
  return count > 0;
}

/** Space below a section in `PeopleSections`; the form spaces them on iOS. */
export const sectionGap = [] satisfies ModifierConfig[];
