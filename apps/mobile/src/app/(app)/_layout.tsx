import { Platform } from "react-native";
import { Stack } from "expo-router";

import { AccountScope, useAccounts } from "~/features/messaging/account";
import { useEnsureProfile } from "~/features/messaging/directory";
import { useAppBadge } from "~/features/notifications/badge";
import {
  useNotificationRouting,
  usePushRegistration,
} from "~/features/notifications/push";

export const unstable_settings = { anchor: "(tabs)" };

/**
 * A sheet whose action (Create, Add) is a toolbar button. iOS shows it as a
 * half-height sheet; Android's sheet has no header, so the button would be
 * missing, and there it's a full modal with a header instead.
 */
const TOOLBAR_SHEET =
  Platform.OS === "ios"
    ? {
        presentation: "formSheet" as const,
        sheetAllowedDetents: [0.5, 1],
        sheetGrabberVisible: true,
      }
    : { presentation: "modal" as const };

/** Keeps one signed-in account's profile and notifications set up. */
function AccountUpkeep() {
  useEnsureProfile();
  usePushRegistration();
  return null;
}

export default function AppLayout() {
  const accounts = useAccounts();
  useNotificationRouting();
  useAppBadge();
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
        // The screen draws its own iMessage-style header, with messages
        // scrolling under it. Swiping back still works without the bar.
        options={{ headerShown: false, title: "" }}
      />
      <Stack.Screen
        name="conversation-info/[conversationId]"
        options={{ headerTransparent: Platform.OS === "ios", title: "" }}
      />
      <Stack.Screen
        name="profile/[address]"
        options={{ headerTransparent: Platform.OS === "ios", title: "" }}
      />
      <Stack.Screen
        name="affiliated"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="reactions"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 1],
          sheetGrabberVisible: true,
          title: "Reactions",
        }}
      />
      <Stack.Screen name="dev-seed" options={{ headerShown: false }} />
      <Stack.Screen
        name="media"
        options={{
          animation: "fade",
          headerShown: false,
          // Transparent so the conversation shows through as a photo is
          // swiped away; the viewer draws its own black backdrop.
          presentation: "transparentModal",
        }}
      />
      <Stack.Screen
        name="new-message"
        // Its own stack: Group continues to a name step.
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="add-account"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="new-space"
        // Its own stack: the name, then the people to invite.
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="new-channel"
        options={{ ...TOOLBAR_SHEET, title: "New Channel" }}
      />
      <Stack.Screen
        name="add-people"
        options={{ ...TOOLBAR_SHEET, title: "Invite People" }}
      />
      <Stack.Screen
        name="invite-link"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 1],
          sheetGrabberVisible: true,
          title: "Invite Link",
        }}
      />
      <Stack.Screen
        name="join/[code]"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
    </Stack>
  );
}
