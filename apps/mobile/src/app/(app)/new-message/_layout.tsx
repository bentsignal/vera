import { Platform } from "react-native";
import { Stack } from "expo-router";

import { GroupMembersProvider } from "~/features/compose/group-members";
import { SheetKeyboardLock } from "~/features/compose/sheet-keyboard";

/** The New Message sheet: pick a person, or people and then a group name. */
export default function NewMessageLayout() {
  return (
    <GroupMembersProvider>
      <SheetKeyboardLock />
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: "minimal",
          // The form's grouped background runs up under the glass header.
          headerTransparent: Platform.OS === "ios",
        }}
      >
        <Stack.Screen name="index" options={{ title: "New Message" }} />
        <Stack.Screen name="group" options={{ title: "New Group" }} />
      </Stack>
    </GroupMembersProvider>
  );
}
