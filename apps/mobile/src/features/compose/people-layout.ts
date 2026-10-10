import type { ModifierConfig } from "@expo/ui/swift-ui/modifiers";

/** Whether to show the picked-people section, with `count` people in it. */
export function showsPickedSection(count: number) {
  return count > 0;
}

/** Space below a section in `PeopleSections`; the form spaces them on iOS. */
export const sectionGap = [] satisfies ModifierConfig[];
