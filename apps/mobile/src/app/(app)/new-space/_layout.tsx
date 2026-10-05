import { Platform } from "react-native";
import { Stack } from "expo-router";

/** The New Space sheet: a name, then the people to add. */
export default function NewSpaceLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: "minimal",
        // The form's grouped background runs up under the glass header.
        headerTransparent: Platform.OS === "ios",
      }}
    >
      <Stack.Screen name="index" options={{ title: "New Space" }} />
      <Stack.Screen name="people" options={{ title: "Add People" }} />
    </Stack>
  );
}
