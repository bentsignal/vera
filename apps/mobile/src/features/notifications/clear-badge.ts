import type { Conversation } from "@decentralized-convex/messages";
import type { PdsOptimisticLocalStore } from "@decentralized-convex/tanstack-query";
import { Alert } from "react-native";
import {
  dismissAllNotificationsAsync,
  setBadgeCountAsync,
} from "expo-notifications";
import { pds } from "@vera/backend/pds";

import {
  ACTIVITY_ARGS,
  isUnseen,
  showSeen,
} from "~/features/activity/activity";
import { activityItems } from "~/features/activity/activity-result";
import { useAccounts } from "~/features/messaging/account";

type Store = PdsOptimisticLocalStore;

/** Whether the badge counts a conversation's unread messages. */
function isCounted(conversation: Pick<Conversation, "alerts" | "muted">) {
  // Servers from before alert levels only say whether it's muted.
  const alerts = conversation.alerts ?? (conversation.muted ? "none" : "all");
  return alerts === "all";
}

function read<Item extends Pick<Conversation, "alerts" | "muted">>(
  item: Item & { unreadCount: number },
) {
  return isCounted(item) && item.unreadCount > 0
    ? { ...item, unreadCount: 0 }
    : item;
}

/**
 * Shows everything the badge counts read in the account's loaded queries,
 * as `clearBadge` marks it: the Inbox's rows that alert about every
 * message, every thread, and every Activity item.
 */
function showCleared(store: Store, seenAt: number) {
  for (const { request, value } of store.getAllQueries(
    pds.messages.conversation,
  )) {
    if (value != null) store.setQuery(request, read(value));
  }
  for (const { request, value } of store.getAllQueries(pds.messages.inbox)) {
    if (value !== undefined) store.setQuery(request, value.map(read));
  }
  for (const { request, value } of store.getAllQueries(
    pds.messages.inboxThreads,
  )) {
    if (value === undefined) continue;
    store.setQuery(
      request,
      value.map((thread) => ({ ...thread, unreadCount: 0 })),
    );
  }
  const activity = store.getQuery(pds.messages.activity(ACTIVITY_ARGS));
  if (activity == null) return;
  const sightings = activityItems([activity])
    .filter(isUnseen)
    .map((item) => ({ key: item.key, through: item.at }));
  showSeen(store, sightings, seenAt);
}

/**
 * Clears the app icon badge for every signed-in account: each account's
 * server marks read what the badge counts (so the next push doesn't bring
 * it back), and the device sets the badge to zero and clears its
 * delivered notifications. Pending space invitations still count, so the
 * badge comes back to their number once the app counts it again.
 */
export function useClearBadge() {
  const accounts = useAccounts();
  return () => {
    const seenAt = Date.now();
    void setBadgeCountAsync(0).catch(() => false);
    void dismissAllNotificationsAsync().catch(() => null);
    void Promise.all(
      accounts.map((account) =>
        account.pds
          .mutate(pds.messages.clearBadge({}), {
            optimisticUpdate: (store) => showCleared(store, seenAt),
          })
          .then(
            () => null,
            () => account.address,
          ),
      ),
    ).then((failed) => {
      const addresses = failed.filter((address) => address !== null);
      if (addresses.length === 0) return;
      Alert.alert(
        "Couldn't Clear the Badge",
        `The server for ${addresses.join(", ")} didn't clear it. Try again later.`,
      );
    });
  };
}
