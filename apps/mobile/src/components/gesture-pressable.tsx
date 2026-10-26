import type { ComponentProps } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { useResolveClassNames } from "uniwind";

/**
 * A button inside a view that Reanimated moves, such as the composer riding
 * the keyboard. React Native's `Pressable` checks where a touch lifts
 * against where the shadow tree puts the button, and Reanimated's fast path
 * for transforms (`IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS`) moves the button
 * without telling the shadow tree, so it could drop the press and need a
 * second tap. Gesture Handler's `Pressable` recognizes the press on the
 * native view, where it really is.
 *
 * `pressedClassName` stands in for `active:`, which only uniwind's own
 * `Pressable` understands.
 */
export function GesturePressable({
  className = "",
  pressedClassName = "",
  style,
  ...props
}: Omit<ComponentProps<typeof Pressable>, "style"> & {
  className?: string;
  /** Classes added while it's pressed. */
  pressedClassName?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const idle = useResolveClassNames(className);
  const pressed = useResolveClassNames(pressedClassName);
  return (
    <Pressable
      {...props}
      style={(state) => [idle, state.pressed && pressed, style]}
    />
  );
}
