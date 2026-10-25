import type { PropsWithChildren } from "react";
import { Platform, View } from "react-native";
import { KeyboardGestureArea } from "react-native-keyboard-controller";

import { useNativeList } from "./switch";

/** Keep one owner of Android's IME during the native list's first down swipe. */
export function ConversationGestureArea({ children }: PropsWithChildren) {
  const native = useNativeList();
  if (Platform.OS === "android" && native) {
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
