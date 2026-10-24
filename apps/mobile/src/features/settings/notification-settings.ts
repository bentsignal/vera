import type {
  AlertLevel,
  NotificationSettings,
} from "@decentralized-convex/messages";
import type { PdsOptimisticLocalStore } from "@decentralized-convex/tanstack-query";
import { useQueries } from "@tanstack/react-query";
import { pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { useAccounts } from "~/features/messaging/account";
import { pdsResultOr } from "~/features/messaging/results";

/** The kinds of notifications turned on or off with a switch. */
export type NotificationKind = keyof {
  [Key in keyof NotificationSettings as NonNullable<
    NotificationSettings[Key]
  > extends boolean
    ? Key
    : never]: true;
};

/** The defaults for what groups and channels alert about. */
export type AlertDefault = "channelAlerts" | "groupAlerts";

function showSetting(
  store: PdsOptimisticLocalStore,
  change: Partial<NotificationSettings>,
) {
  const request = pds.messages.notificationSettings({});
  const settings = store.getQuery(request);
  if (settings != null) store.setQuery(request, { ...settings, ...change });
}

/**
 * Which notifications you get. They're set the same for every signed-in
 * account (each account's server sends its own pushes), so the screen
 * shows the first account's and a change goes to all of them. Accounts on
 * servers without these settings are left out; `settings` is null when no
 * account has them.
 */
export function useNotificationSettings() {
  const accounts = useAccounts();
  const results = useQueries({
    queries: accounts.map((account) =>
      pdsQuery({
        args: {},
        // The home PDS answers; null when it can't (an older server).
        options: {
          select: (result) => {
            const answer = pdsResultOr(result, null);
            return answer === undefined ? undefined : (answer?.[0] ?? null);
          },
        },
        query: pds.messages.notificationSettings,
        session: account.address,
      }),
    ),
  });
  const supported = accounts.filter((_, index) => results[index]?.data != null);
  const settings = results.find((result) => result.data != null)?.data;
  const answered = results.every((result) => result.data !== undefined);
  function save(change: Partial<NotificationSettings>) {
    return Promise.all(
      supported.map((account) =>
        account.pds.mutate(pds.messages.setNotificationSettings(change), {
          optimisticUpdate: (store) => showSetting(store, change),
        }),
      ),
    );
  }
  return {
    settings: settings ?? (answered ? null : undefined),
    /** Turns one kind on or off for every account, showing it right away. */
    set: (kind: NotificationKind, on: boolean) => save({ [kind]: on }),
    /** Replaces the words that alert you, showing them right away. */
    setKeywords: (keywords: readonly string[]) =>
      save({ keywords: [...keywords] }),
    /** Sets what groups or channels alert about unless they say otherwise. */
    setDefault: (kind: AlertDefault, level: AlertLevel) => {
      // Older apps read the switch, so it changes with the level.
      const on = level !== "none";
      return save(
        kind === "groupAlerts"
          ? { groupAlerts: level, groups: on }
          : { channelAlerts: level, channels: on },
      );
    },
  };
}
