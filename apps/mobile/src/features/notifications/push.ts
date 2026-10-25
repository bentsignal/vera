import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useFocusEffect, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { pdsMutation } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import type { ConversationOnScreen } from "./presentation";
import { env } from "~/env";
import { useAccount } from "~/features/messaging/account";
import { usePreference } from "~/features/preferences/store";
import { notificationIsNews } from "./presentation";
import { stringField } from "./presented";

let activeConversationId: string | undefined;
let conversationOnScreen: ConversationOnScreen | undefined;
let reactionSheetOnScreen: ConversationOnScreen | undefined;
let threadOnScreen:
  | (ConversationOnScreen & { readonly threadId: string })
  | undefined;
/** The thread on screen, whose replies' banners stay quiet. */
let activeThreadId: string | undefined;
/** Whether the Inbox is on screen, where new messages show in the list. */
let inboxOnScreen = false;
/** Whether Activity is on screen, where new reactions show in the list. */
let activityOnScreen = false;

/**
 * Marks the conversation as the one on screen, which suppresses its banners
 * and lets a tap on its notification reuse the screen.
 */
export function useActiveConversation(conversationId: string) {
  const { address } = useAccount();
  useFocusEffect(() => {
    const shown = { accountId: address, conversationId };
    conversationOnScreen = shown;
    activeConversationId = conversationId;
    return () => {
      if (conversationOnScreen === shown) {
        conversationOnScreen = undefined;
        activeConversationId = undefined;
      }
    };
  });
}

/**
 * Marks the thread as the one on screen, which suppresses its replies'
 * banners and lets a tap on one reuse the screen.
 */
export function useActiveThread(threadId: string, conversationId: string) {
  const { address } = useAccount();
  useFocusEffect(() => {
    const shown = { accountId: address, conversationId, threadId };
    threadOnScreen = shown;
    activeThreadId = threadId;
    return () => {
      if (threadOnScreen === shown) {
        threadOnScreen = undefined;
        activeThreadId = undefined;
      }
    };
  });
}

/** The reaction sheet still belongs to its chat, but isn't a routing root. */
export function useReactionConversation(conversationId: string) {
  const { address } = useAccount();
  useFocusEffect(() => {
    const shown = { accountId: address, conversationId };
    reactionSheetOnScreen = shown;
    return () => {
      if (reactionSheetOnScreen === shown) reactionSheetOnScreen = undefined;
    };
  });
}

/**
 * Marks the Inbox as on screen, which suppresses message banners: while
 * Home is focused and `onScreen` (its Inbox page is the one showing).
 */
export function useInboxOnScreen(onScreen: boolean) {
  useFocusEffect(() => {
    if (!onScreen) return;
    inboxOnScreen = true;
    return () => {
      inboxOnScreen = false;
    };
  });
}

/** Marks Activity as on screen, which suppresses reaction banners. */
export function useActivityOnScreen() {
  useFocusEffect(() => {
    activityOnScreen = true;
    return () => {
      activityOnScreen = false;
    };
  });
}

/**
 * Whether a notification would tell you something not already on screen.
 * Space invitations have no conversation and always show. A message stays
 * quiet in its own open conversation, and on the Inbox, where it shows up
 * in the list; a reaction likewise in its conversation and on Activity;
 * and a reply kept in its thread in that thread and on Activity.
 */
function isNews(data: unknown) {
  return notificationIsNews(
    {
      accountId: stringField(data, "accountId"),
      conversationId: stringField(data, "conversationId"),
      threadId: stringField(data, "threadId"),
      kind: stringField(data, "kind"),
    },
    {
      foreground: AppState.currentState === "active",
      conversation: conversationOnScreen,
      reactionSheet: reactionSheetOnScreen,
      thread: threadOnScreen,
      inbox: inboxOnScreen,
      activity: activityOnScreen,
    },
  );
}

Notifications.setNotificationHandler({
  handleNotification: (notification) => {
    const visible = isNews(notification.request.content.data);
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

/**
 * Registers this device for the account's message notifications, with
 * the kinds of rows its Inbox lists, so a push's badge counts what Home's
 * does. Registers again when they change.
 */
export function usePushRegistration() {
  const { address } = useAccount();
  const kinds = usePreference("inboxIncludes");
  const register = useMutation(
    pdsMutation({ mutation: pds.messages.registerPushToken, session: address }),
  );
  const { mutate } = register;
  // eslint-disable-next-line no-restricted-syntax -- Registers this device with the OS push service and the server once per sign-in, and again when the Inbox's kinds (which the server's badge counts) change.
  useEffect(() => {
    void getPushToken().then((token) => {
      // This app shows threads, so its pushes' badges count them.
      if (token !== null) mutate({ inbox: [...kinds], threads: true, token });
    });
  }, [kinds, mutate]);
}

/**
 * Opens the conversation when someone taps a message notification (at the
 * message, for a reaction's), the thread for a reply kept in its thread,
 * and
 * Activity (where invitations are answered) when they tap a space
 * invitation.
 */
export function useNotificationRouting() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  // eslint-disable-next-line no-restricted-syntax -- Responds to a notification tap delivered by the OS.
  useEffect(() => {
    const data = response?.notification.request.content.data;
    if (stringField(data, "kind") === "spaceInvite") {
      router.navigate("/activity");
      void Notifications.clearLastNotificationResponseAsync();
      return;
    }
    const conversationId = stringField(data, "conversationId");
    if (conversationId === undefined) return;
    const messageId = stringField(data, "messageId");
    // Open as the account the message was sent to, at the message itself
    // so an old notification stays useful.
    const account = stringField(data, "accountId");
    const threadId = stringField(data, "threadId");
    if (threadId !== undefined) {
      const thread = {
        ...(account === undefined ? {} : { account }),
        conversationId,
      };
      if (threadId === activeThreadId) router.setParams(thread);
      else {
        router.push({
          params: { ...thread, threadId },
          pathname: "/thread/[threadId]",
        });
      }
      void Notifications.clearLastNotificationResponseAsync();
      return;
    }
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
