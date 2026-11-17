import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { AppState } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  interpolate,
  makeMutable,
  useAnimatedStyle,
} from "react-native-reanimated";

// Goes up each time the app returns to the foreground.
const returns = makeMutable(0);
AppState.addEventListener("change", (state) => {
  if (state === "active") returns.set(returns.get() + 1);
});

/**
 * react-native-keyboard-controller's `KeyboardStickyView`, `opened` higher
 * while the keyboard is up, that also sends its position again each time
 * the app returns to the foreground.
 *
 * A second or two after a position settles, Reanimated copies it into
 * React's props on a JavaScript timer, and drops it unsent if it's more
 * than two seconds old by then. The timer stops while another activity is
 * in front, so opening the photo picker within a second of the keyboard
 * going down left React with the keyboard-up position, and the next render
 * (the picked photo appearing) put the composer back up there with no
 * keyboard under it. Sending it again on return gives Reanimated a fresh
 * one.
 */
export function KeyboardSticky({
  opened,
  style,
  children,
}: {
  opened: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { height, progress } = useReanimatedKeyboardAnimation();
  const stuck = useAnimatedStyle(() => {
    returns.get(); // runs this again on return
    const offset = interpolate(progress.get(), [0, 1], [0, opened]);
    return { transform: [{ translateY: height.get() + offset }] };
  });
  return <Animated.View style={[style, stuck]}>{children}</Animated.View>;
}
