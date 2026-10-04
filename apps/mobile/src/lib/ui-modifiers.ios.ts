import {
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  foregroundStyle,
  frame,
  listRowBackground,
  listRowInsets,
  scrollDismissesKeyboard,
} from "@expo/ui/swift-ui/modifiers";

export const fillWidth = [frame({ maxWidth: Infinity })];
export const fillRow = [];
export const growInRow = [];
export const prominentButton = [
  buttonStyle("glassProminent"),
  buttonBorderShape("capsule"),
  controlSize("large"),
];
export const largeButton = [buttonBorderShape("capsule"), controlSize("large")];
export const circleButton = [
  buttonStyle("glass"),
  buttonBorderShape("circle"),
  controlSize("large"),
];
export const circleProminentButton = [
  buttonStyle("glassProminent"),
  buttonBorderShape("circle"),
  controlSize("small"),
];
/** Borderless buttons take the accent tint, like iOS text buttons. */
export const linkButton = [buttonStyle("borderless")];
export const destructive = [buttonStyle("borderless"), foregroundStyle("red")];
/** Dragging a form down pulls the keyboard away with it. */
export const dismissKeyboardOnScroll = [
  scrollDismissesKeyboard("interactively"),
];
/** A form row whose content (such as a carousel) reaches the card edges. */
export const edgeToEdgeRow = [
  listRowInsets({ bottom: 10, leading: 0, top: 12, trailing: 0 }),
];
/** A full-width form row drawn straight on the page, without a card. */
export const plainRow = [
  frame({ maxWidth: Infinity }),
  listRowBackground("clear"),
];
/** One choice in a row of custom-drawn options, read as a labeled button. */
export function choiceButton(label: string, selected: boolean) {
  return [
    accessibilityElement("ignore"),
    accessibilityLabel(label),
    accessibilityAddTraits(
      selected ? ["isButton", "isSelected"] : ["isButton"],
    ),
  ];
}
