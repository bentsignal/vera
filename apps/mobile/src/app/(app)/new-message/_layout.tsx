import { Platform } from "react-native";
import { Stack } from "expo-router";

/** The New Message sheet: pick a person, or people and then a group name. */
export default function NewMessageLayout() {
  return (
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
  );
}
