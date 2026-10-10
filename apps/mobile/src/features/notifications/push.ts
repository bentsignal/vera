import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useFocusEffect, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { pdsMutation } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { env } from "~/env";
import { useAccount } from "~/features/messaging/account";
import { stringField } from "./presented";

let activeConversationId: string | undefined;

/**
 * Marks the conversation as the one on screen, which suppresses its banners
 * and lets a tap on its notification reuse the screen.
 */
export function useActiveConversation(conversationId: string) {
  useFocusEffect(() => {
    activeConversationId = conversationId;
    return () => {
      if (activeConversationId === conversationId) {
        activeConversationId = undefined;
      }
    };
  });
}

Notifications.setNotificationHandler({
  handleNotification: (notification) => {
    const conversationId = stringField(
      notification.request.content.data,
      "conversationId",
    );
    // Space invitations have no conversation and always show.
    const visible =
      conversationId === undefined || conversationId !== activeConversationId;
    return Promise.resolve({
      shouldPlaySound: visible,
      // A push's badge counts only its own account; `useAppBadge` sets the
      // total across accounts while the app is open.
      shouldSetBadge: false,
      shouldShowBanner: visible,
      // Not in the notification list either: on Android that list is the
      // shade, whose icons show at the top of the screen while you read.
      shouldShowList: visible,
    });
  },
});

export async function getPushToken() {
  // The iOS Simulator has no APNs token for this app. Android emulators
  // with Google Play services receive FCM pushes like phones do.
  if (!Device.isDevice && Platform.OS !== "android") return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("messages", {
      importance: Notifications.AndroidImportance.HIGH,
      name: "Messages",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted
    ? current
    : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;
  const { data } = await Notifications.getExpoPushTokenAsync({
    projectId: env.easProjectId,
  });
  return data;
}

/** Registers this device for the account's message notifications. */
export function usePushRegistration() {
  const { address } = useAccount();
  const register = useMutation(
    pdsMutation({ mutation: pds.messages.registerPushToken, session: address }),
  );
  const { mutate } = register;
  // eslint-disable-next-line no-restricted-syntax -- Registers this device with the OS push service and the server once per sign-in.
  useEffect(() => {
    void getPushToken().then((token) => {
      if (token !== null) mutate({ token });
    });
  }, [mutate]);
}

/**
 * Opens the conversation when someone taps a message notification, and the
 * invites when they tap a space invitation.
 */
export function useNotificationRouting() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  // eslint-disable-next-line no-restricted-syntax -- Responds to a notification tap delivered by the OS.
  useEffect(() => {
    const data = response?.notification.request.content.data;
    if (stringField(data, "kind") === "spaceInvite") {
      router.push("/spaces/invites");
      void Notifications.clearLastNotificationResponseAsync();
      return;
    }
    const conversationId = stringField(data, "conversationId");
    if (conversationId === undefined) return;
    const messageId = stringField(data, "messageId");
    // Open as the account the message was sent to, at the message itself
    // so an old notification stays useful.
    const account = stringField(data, "accountId");
    const params = {
      ...(account === undefined ? {} : { account }),
      ...(messageId === undefined ? {} : { messageId }),
    };
    if (conversationId === activeConversationId) {
      // Already on screen: pushing would stack a second copy, so swiping
      // back would land on the same conversation.
      router.setParams(params);
    } else {
      router.push({
        params: { conversationId, ...params },
        pathname: "/conversation/[conversationId]",
      });
    }
    void Notifications.clearLastNotificationResponseAsync();
  }, [response, router]);
}
