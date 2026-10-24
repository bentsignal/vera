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

/** The settings older servers don't have, sent only to those that do. */
const WORD_SETTINGS = new Set(["keywords", "yourName"]);

/**
 * Which notifications you get. They're set the same for every signed-in
 * account (each account's server sends its own pushes, and matches its
 * own account's name), so the screen shows one account's and a change
 * goes to all of them: the first account's, unless another's server has
 * your name and keywords and its doesn't. Accounts on servers without
 * these settings are left out; `settings` is null when no account has
 * them.
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
  const found = accounts.flatMap((account, index) => {
    const data = results[index]?.data;
    return data == null ? [] : [{ account, settings: data }];
  });
  const settings = (
    found.find((each) => each.settings.keywords !== undefined) ?? found[0]
  )?.settings;
  const answered = results.every((result) => result.data !== undefined);
  function save(change: Partial<NotificationSettings>) {
    return Promise.all(
      found.flatMap(({ account, settings: current }) => {
        const sent =
          current.keywords === undefined
            ? Object.fromEntries(
                Object.entries(change).filter(
                  ([key]) => !WORD_SETTINGS.has(key),
                ),
              )
            : change;
        if (Object.keys(sent).length === 0) return [];
        return [
          account.pds.mutate(pds.messages.setNotificationSettings(sent), {
            optimisticUpdate: (store) => showSetting(store, sent),
          }),
        ];
      }),
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
