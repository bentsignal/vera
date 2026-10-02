import { Platform } from "react-native";
import { Stack } from "expo-router";

/** The native stack inside each tab: large titles that collapse on scroll. */
export function TabStack() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: "minimal",
        headerLargeTitleEnabled: true,
        headerTransparent: Platform.OS === "ios",
      }}
    />
  );
}
