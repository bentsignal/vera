import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { pdsMutation } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { env } from "~/env";

let activeConversationId: string | undefined;

/** Suppresses banners for the conversation currently on screen. */
export function useActiveConversation(conversationId: string) {
  // eslint-disable-next-line no-restricted-syntax -- Mirrors the open screen into the notification handler, which runs outside React.
  useEffect(() => {
    activeConversationId = conversationId;
    return () => {
      if (activeConversationId === conversationId) {
        activeConversationId = undefined;
      }
    };
  }, [conversationId]);
}

function conversationIdOf(data: unknown) {
  return typeof data === "object" &&
    data !== null &&
    "conversationId" in data &&
    typeof data.conversationId === "string"
    ? data.conversationId
    : undefined;
}

function messageIdOf(data: unknown) {
  return typeof data === "object" &&
    data !== null &&
    "messageId" in data &&
    typeof data.messageId === "string"
    ? data.messageId
    : undefined;
}

Notifications.setNotificationHandler({
  handleNotification: (notification) => {
    const conversationId = conversationIdOf(notification.request.content.data);
    const visible = conversationId !== activeConversationId;
    return Promise.resolve({
      shouldPlaySound: visible,
      shouldSetBadge: false,
      shouldShowBanner: visible,
      shouldShowList: true,
    });
  },
});

export async function getPushToken() {
  if (!Device.isDevice) return null;
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

/** Registers this device for message notifications after sign-in. */
export function usePushRegistration() {
  const register = useMutation(
    pdsMutation({ mutation: pds.messages.registerPushToken }),
  );
  const { mutate } = register;
  // eslint-disable-next-line no-restricted-syntax -- Registers this device with the OS push service and the server once per sign-in.
  useEffect(() => {
    void getPushToken().then((token) => {
      if (token !== null) mutate({ token });
    });
  }, [mutate]);
}

/** Opens the conversation when someone taps a message notification. */
export function useNotificationRouting() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  // eslint-disable-next-line no-restricted-syntax -- Responds to a notification tap delivered by the OS.
  useEffect(() => {
    const data = response?.notification.request.content.data;
    const conversationId = conversationIdOf(data);
    if (conversationId === undefined) return;
    const messageId = messageIdOf(data);
    router.push({
      // Opening at the message keeps an old notification useful.
      params:
        messageId === undefined
          ? { conversationId }
          : { conversationId, messageId },
      pathname: "/conversation/[conversationId]",
    });
    void Notifications.clearLastNotificationResponseAsync();
  }, [response, router]);
}
