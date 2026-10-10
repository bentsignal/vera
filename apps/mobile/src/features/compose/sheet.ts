import { Keyboard, Platform } from "react-native";
import { useNavigation } from "expo-router";
import ArrowForward from "@expo/material-symbols/arrow_forward.xml";
import Check from "@expo/material-symbols/check.xml";
import Close from "@expo/material-symbols/close.xml";

/**
 * Toolbar icons for create sheets. Android toolbar buttons are icon-only;
 * iOS shows "Next" as text (`nextIcon` is undefined there).
 */
export const sheetIcons = {
  close: Platform.OS === "ios" ? ("xmark" as const) : Close,
  done: Platform.OS === "ios" ? ("checkmark" as const) : Check,
  next: Platform.OS === "ios" ? undefined : ArrowForward,
};

/**
 * Closes a create sheet that has its own stack (New Message, New Space)
 * from any of its steps, by popping the sheet off the app stack.
 */
export function useCloseSheet() {
  const navigation = useNavigation();
  return () => navigation.getParent()?.goBack();
}

/**
 * Screen listeners for a create sheet: swiping it down while the keyboard
 * is up (when `SheetKeyboardLock` holds it open) puts the keyboard away.
 */
export const dismissKeyboardOnSheetSwipe = {
  gestureCancel: () => Keyboard.dismiss(),
};
