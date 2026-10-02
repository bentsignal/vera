import type { ModifierConfig } from "@expo/ui/swift-ui/modifiers";

/**
 * Platform modifier presets for `@expo/ui` components. The `.ios.ts` and
 * `.android.ts` variants hold the real values; other platforms get none.
 */
export const fillWidth = [] satisfies ModifierConfig[];
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
