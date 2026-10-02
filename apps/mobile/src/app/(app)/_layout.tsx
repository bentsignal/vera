import { Stack } from "expo-router";

import { AccountScope, useAccounts } from "~/features/messaging/account";
import { useEnsureProfile } from "~/features/messaging/directory";
import {
  useNotificationRouting,
  usePushRegistration,
} from "~/features/notifications/push";

export const unstable_settings = { anchor: "(tabs)" };

/** Keeps one signed-in account's profile and notifications set up. */
function AccountUpkeep() {
  useEnsureProfile();
  usePushRegistration();
  return null;
}

export default function AppLayout() {
  const accounts = useAccounts();
  useNotificationRouting();
  return (
    <>
      {accounts.map((account) => (
        <AccountScope key={account.address} address={account.address}>
          <AccountUpkeep />
        </AccountScope>
      ))}
      <AppStack />
    </>
  );
}

function AppStack() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="conversation/[conversationId]"
        // Messages scroll under a transparent header, which iOS fades with
        // its scroll edge effect. The title comes from the opening screen.
        options={{ headerTransparent: true, title: "" }}
      />
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
        name="add-account"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.6, 1],
          sheetGrabberVisible: true,
          title: "Add Account",
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
