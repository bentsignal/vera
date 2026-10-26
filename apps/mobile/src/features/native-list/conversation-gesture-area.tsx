import type { PropsWithChildren } from "react";
import { Platform, View } from "react-native";
import { KeyboardGestureArea } from "react-native-keyboard-controller";

/** Keep one owner of Android's IME during the native list's first down swipe. */
export function ConversationGestureArea({ children }: PropsWithChildren) {
  if (Platform.OS === "android") {
    // The interactive parent otherwise requests IME control before the list
    // can hide it, then restores the keyboard when the same gesture ends.
    return <View style={{ flex: 1 }}>{children}</View>;
  }
  return (
    <KeyboardGestureArea interpolator="ios" offset={60} style={{ flex: 1 }}>
      {children}
    </KeyboardGestureArea>
  );
}
