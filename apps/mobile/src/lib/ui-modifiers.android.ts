import { fillMaxWidth, weight } from "@expo/ui/jetpack-compose/modifiers";

export const fillWidth = [fillMaxWidth()];
export const fillRow = [fillMaxWidth()];
export const growInRow = [weight(1)];
export const prominentButton = [fillMaxWidth()];
export const largeButton = [fillMaxWidth()];
export const circleButton = [];
export const circleProminentButton = [];
export const linkButton = [];
export const destructive = [];
export const dismissKeyboardOnScroll = [];
export const edgeToEdgeRow = [];
export const plainRow = [fillMaxWidth()];
export function choiceButton(_label: string, _selected: boolean) {
  return [];
}

export const nestedListItemColors = { containerColor: "transparent" };
/** A screen's second action; Android draws it as an outlined button. */
export const secondaryButton = [fillMaxWidth()];
