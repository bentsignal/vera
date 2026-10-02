import { Stack } from "expo-router";

import { useEnsureProfile } from "~/features/messaging/directory";
import {
  useNotificationRouting,
  usePushRegistration,
} from "~/features/notifications/push";

export const unstable_settings = { anchor: "(tabs)" };

export default function AppLayout() {
  useEnsureProfile();
  usePushRegistration();
  useNotificationRouting();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="conversation/[conversationId]" />
      <Stack.Screen
        name="media"
        options={{
          animation: "fade",
          headerShown: false,
          presentation: "fullScreenModal",
        }}
      />
      <Stack.Screen
        name="new-message"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 1],
          sheetGrabberVisible: true,
          title: "New Message",
        }}
      />
      <Stack.Screen
        name="new-space"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 1],
          sheetGrabberVisible: true,
          title: "New Space",
        }}
      />
      <Stack.Screen
        name="new-channel"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 1],
          sheetGrabberVisible: true,
          title: "New Channel",
        }}
      />
      <Stack.Screen
        name="add-people"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 1],
          sheetGrabberVisible: true,
          title: "Add People",
        }}
      />
    </Stack>
  );
}
