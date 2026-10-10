import { useKeyboardState } from "react-native-keyboard-controller";
import { Stack } from "expo-router";

/**
 * Lets a downward swipe in a create sheet put the keyboard away instead of
 * closing the sheet: while the keyboard is up, the sheet can't be swiped
 * closed (a swipe on its form drags the keyboard down instead), and an
 * attempt dismisses the keyboard (`dismissKeyboardOnSheetSwipe`). Once the
 * keyboard is down, the swipe closes the sheet again.
 *
 * Render it where the sheet's own screen options apply: a sheet with its
 * own stack renders it in its layout, beside the `Stack`, so it doesn't
 * touch the swipe back between the sheet's steps. Only iOS swipes sheets
 * closed; Android ignores `gestureEnabled`.
 */
export function SheetKeyboardLock() {
  const typing = useKeyboardState((state) => state.isVisible);
  return <Stack.Screen options={{ gestureEnabled: !typing }} />;
}
