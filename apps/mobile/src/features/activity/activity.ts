import type { ActivityItem } from "@decentralized-convex/messages";
import type { PdsOptimisticLocalStore } from "@decentralized-convex/tanstack-query";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ACTIVITY_SEEN_LIFETIME } from "@decentralized-convex/messages";
import { pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import type { AccountSpaceInvite } from "~/features/messaging/spaces";
import { useVisibleAccounts } from "~/features/messaging/account";
import { conversationTitle } from "~/features/messaging/conversations";
import { useProfileState } from "~/features/messaging/profiles";
import { pdsResultOr } from "~/features/messaging/results";
import { useSpaceInvites } from "~/features/messaging/spaces";
import { liveSession } from "~/features/session/account-session";
import { activityItems, mapActivity } from "./activity-result";

/** One row of the Activity tab. */
export interface ActivityEntry {
  /** The signed-in account it happened to. */
  readonly account: string;
  readonly item: ActivityItem;
  /**
   * Unique across accounts. It changes when something new happens in the
   * item, so the row counts as unseen (and new to the list) again.
   */
  readonly key: string;
  /** The conversation's name, as the Inbox shows it. */
  readonly title: string;
  /** Whether it holds anything not yet seen on screen. */
  readonly unseen: boolean;
}

/**
 * One row of the Activity list: the space invitations waiting (one row
 * for all of them, at the top), or an activity entry. Only entries are
 * tracked as seen.
 */
export type ActivityListRow =
  | {
      readonly invites: readonly AccountSpaceInvite[];
      readonly key: string;
      readonly kind: "invites";
    }
  | {
      readonly entry: ActivityEntry;
      readonly key: string;
      readonly kind: "activity";
    };

/**
 * What Activity asks its PDS for: what's about you, which leaves others'
 * messages to the Inbox. Thread replies, and each message that @mentions
 * you or replies to yours, are items of their own.
 */
export const ACTIVITY_ARGS = {
  aboutYou: true,
  // Each conversation once, not repeated in each of its items.
  compact: true,
  mentions: true,
  threads: true,
};

export function isUnseen(item: ActivityItem) {
  return item.seenThrough === undefined || item.at > item.seenThrough;
}

/** Whether a day has passed since everything in it was seen. */
function isGone(item: ActivityItem, now: number) {
  return (
    !isUnseen(item) &&
    item.seenAt !== undefined &&
    item.seenAt + ACTIVITY_SEEN_LIFETIME <= now
  );
}

/** Who acted in an item, newest first, without repeats. */
export function actorsOf(item: ActivityItem) {
  if (item.kind === "reactions") {
    return [...new Set(item.reactions.map(({ accountId }) => accountId))];
  }
  return item.kind === "mention" || item.kind === "reply"
    ? [item.message.authorId]
    : item.authors;
}

/** Everyone an item's row names: who acted, and who titles the chat. */
function peopleIn(account: string, item: ActivityItem) {
  const { kind, members, name } = item.conversation;
  const titled =
    kind === "direct" || (kind === "group" && name === null)
      ? members.filter((member) => member !== account)
      : [];
  return [...titled, ...actorsOf(item)];
}

function useActivityQueries(accounts: readonly string[]) {
  return useQueries({
    queries: accounts.map((session) =>
      pdsQuery({
        args: ACTIVITY_ARGS,
        // A server without activity (an older one) has nothing to show.
        options: {
          select: (result) => {
            const found = pdsResultOr(result, []);
            return found === undefined ? undefined : activityItems(found);
          },
        },
        query: pds.messages.activity,
        session,
      }),
    ),
  });
}

/**
 * The Activity tab's rows across the visible accounts, newest first,
 * leaving out items that went a day after they were seen (as of `now`).
 *
 * Like the Inbox, it loads once, waiting the first time for every name so
 * rows never switch from usernames to names; a row that arrives later
 * joins once its names have loaded.
 */
export function useActivity(now: number) {
  const accounts = useVisibleAccounts().map(({ address }) => address);
  const results = useActivityQueries(accounts);
  const found = results.flatMap((result, index) =>
    (result.data ?? []).map((item) => ({
      account: accounts[index] ?? "",
      item,
    })),
  );
  const profiles = useProfileState(
    found.flatMap(({ account, item }) => peopleIn(account, item)),
  );
  const [loaded, setLoaded] = useState(false);
  const ready =
    loaded ||
    (results.some((result) => result.data !== undefined) &&
      !profiles.isLoading);
  if (ready && !loaded) setLoaded(true);
  const entries = found
    .filter(
      ({ account, item }) =>
        !isGone(item, now) && peopleIn(account, item).every(profiles.isLoaded),
    )
    .map(({ account, item }) => ({
      account,
      item,
      key: `${account} ${item.key} ${item.at}`,
      title: conversationTitle(
        item.conversation,
        account,
        (address) => profiles.profileOf(address).displayName,
      ),
      unseen: isUnseen(item),
    }))
    .sort((left, right) => right.item.at - left.item.at);
  return {
    entries: ready ? entries : undefined,
    profileOf: profiles.profileOf,
  };
}

/**
 * The Activity tab's badge: space invitations waiting for an answer, plus
 * activity not yet seen (messages that mention you or reply to yours,
 * messages of yours with new reactions, and threads with new replies;
 * muted ones left out). Home has its own (`useHomeBadge`).
 */
export function useActivityBadge() {
  const accounts = useVisibleAccounts().map(({ address }) => address);
  const invites = useSpaceInvites().invites.length;
  const unseen = useActivityQueries(accounts)
    .flatMap((result) => result.data ?? [])
    .filter(isUnseen).length;
  return invites + unseen;
}

interface Sighting {
  readonly key: string;
  readonly through: number;
}

/** Shows the items as seen in the account's loaded activity. */
function showSeen(
  store: PdsOptimisticLocalStore,
  sightings: readonly Sighting[],
  seenAt: number,
) {
  const request = pds.messages.activity(ACTIVITY_ARGS);
  const result = store.getQuery(request);
  if (result == null) return;
  store.setQuery(
    request,
    mapActivity(result, (item) => {
      const sighting = sightings.find(({ key }) => key === item.key);
      if (sighting === undefined) return item;
      if (
        item.seenThrough !== undefined &&
        item.seenThrough >= sighting.through
      ) {
        return item;
      }
      return { ...item, seenAt, seenThrough: sighting.through };
    }),
  );
}

/**
 * Records that rows came into view, each through its newest activity,
 * showing them as seen right away. Resolves to whether every account's
 * PDS stored them.
 */
export async function markSeen(entries: readonly ActivityEntry[]) {
  const byAccount = new Map<string, ActivityEntry[]>();
  for (const entry of entries) {
    byAccount.set(entry.account, [
      ...(byAccount.get(entry.account) ?? []),
      entry,
    ]);
  }
  const seenAt = Date.now();
  const saved = await Promise.all(
    [...byAccount].map(async ([account, seen]) => {
      const session = liveSession(account);
      if (session === undefined) return false;
      const sightings = seen.map(({ item }) => ({
        key: item.key,
        through: item.at,
      }));
      return session.pds
        .mutate(pds.messages.markActivitySeen({ items: sightings }), {
          optimisticUpdate: (store) => {
            showSeen(store, sightings, seenAt);
          },
        })
        .then(
          () => true,
          () => false,
        );
    }),
  );
  return saved.every(Boolean);
}
