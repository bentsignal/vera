import type { ModifierConfig } from "@expo/ui/swift-ui/modifiers";

/**
 * Platform modifier presets for `@expo/ui` components. The `.ios.ts` and
 * `.android.ts` variants hold the real values; other platforms get none.
 */
export const fillWidth = [] satisfies ModifierConfig[];
/**
 * A settings row that spans its section, so a flexible `Spacer` pushes the
 * value to the trailing edge. Only Compose needs it.
 */
export const fillRow = [] satisfies ModifierConfig[];
/** A field that takes the rest of its `Row`, leaving room for a suffix. */
export const growInRow = [] satisfies ModifierConfig[];
export const prominentButton = [] satisfies ModifierConfig[];
export const largeButton = [] satisfies ModifierConfig[];
export const circleButton = [] satisfies ModifierConfig[];
export const circleProminentButton = [] satisfies ModifierConfig[];
export const linkButton = [] satisfies ModifierConfig[];
export const destructive = [] satisfies ModifierConfig[];
export const dismissKeyboardOnScroll = [] satisfies ModifierConfig[];
export const edgeToEdgeRow = [] satisfies ModifierConfig[];
export const plainRow = [] satisfies ModifierConfig[];
export function choiceButton(_label: string, _selected: boolean) {
  return [] satisfies ModifierConfig[];
}
