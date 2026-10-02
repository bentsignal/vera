import { Stack } from "expo-router";

export const unstable_settings = { anchor: "(tabs)" };

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="conversation/[conversationId]" />
      <Stack.Screen
        name="new-message"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 1],
          sheetGrabberVisible: true,
          title: "New Message",
        }}
      />
    </Stack>
  );
}
