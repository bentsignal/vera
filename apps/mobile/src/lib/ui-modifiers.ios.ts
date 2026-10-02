import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  foregroundStyle,
  frame,
} from "@expo/ui/swift-ui/modifiers";

export const fillWidth = [frame({ maxWidth: Infinity })];
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
