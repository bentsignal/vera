import { Platform } from "react-native";
import { Stack } from "expo-router";

import { SheetKeyboardLock } from "~/features/compose/sheet-keyboard";

/** The New Space sheet: a name, then the people to invite. */
export default function NewSpaceLayout() {
  return (
    <>
      <SheetKeyboardLock />
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: "minimal",
          // The form's grouped background runs up under the glass header.
          headerTransparent: Platform.OS === "ios",
        }}
      >
        <Stack.Screen name="index" options={{ title: "New Space" }} />
        <Stack.Screen name="people" options={{ title: "Invite People" }} />
      </Stack>
    </>
  );
}
