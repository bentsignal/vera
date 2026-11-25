import { useEffect, useEffectEvent, useState } from "react";
import { Alert } from "react-native";
import { useGlobalSearchParams, useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import type { WatchedSpace } from "./removal";
import { useVisibleAccounts } from "~/features/messaging/account";
import { pdsResult } from "~/features/messaging/results";
import { isScreenInSpace, leftOnPurpose, lostSpaces } from "./removal";

type Snapshot = ReadonlyMap<string, readonly WatchedSpace[]>;

/**
 * Each visible account's spaces (the same queries as Home's Spaces list),
 * for the accounts that have answered.
 */
function useSpacesByAccount() {
  const accounts = useVisibleAccounts().map((account) => account.address);
  const results = useQueries({
    queries: accounts.map((session) =>
      pdsQuery({
        args: {},
        options: { select: pdsResult },
        query: pds.messages.spaces,
        session,
      }),
    ),
  });
  const snapshot = new Map<string, WatchedSpace[]>();
  results.forEach((result, index) => {
    const account = accounts[index];
    if (result.data === undefined || account === undefined) return;
    snapshot.set(
      account,
      result.data.map((space) => ({ ...space, account })),
    );
  });
  return snapshot;
}

/** Changes when an account's spaces or their channels do. */
function signature(snapshot: Snapshot) {
  return JSON.stringify(
    [...snapshot].map(([account, spaces]) => [
      account,
      spaces.map((space) => [
        space.spaceId,
        space.channels.map((channel) => channel.conversationId),
      ]),
    ]),
  );
}

/**
 * Takes someone back to Home with an alert when they're removed from a
 * space (or it's deleted) while the screen in front is inside it: the
 * space, one of its channels or threads, or anything else that names the
 * space or a channel in its route (`isScreenInSpace`). Screens elsewhere
 * stay put, and leaving on your own (`markLeaving`) shows nothing.
 * Mounted once, in the app's layout.
 */
export function useRemovedFromSpace() {
  const router = useRouter();
  const params = useGlobalSearchParams();
  const snapshot = useSpacesByAccount();
  const [seen, setSeen] = useState<{
    key: string;
    lost: readonly WatchedSpace[];
    snapshot: Snapshot;
  }>({ key: "", lost: [], snapshot: new Map() });
  const key = signature(snapshot);
  if (key !== seen.key) {
    setSeen({ key, lost: lostSpaces(seen.snapshot, snapshot), snapshot });
  }

  const onLost = useEffectEvent((lost: readonly WatchedSpace[]) => {
    for (const space of lost) {
      if (leftOnPurpose(space.account, space.spaceId)) continue;
      if (!isScreenInSpace(params, space)) continue;
      router.dismissTo("/");
      Alert.alert(`You were removed from ${space.name}`);
      return;
    }
  });
  // eslint-disable-next-line no-restricted-syntax -- A space disappearing from a live query isn't an event any screen handles; only watching the query can catch the moment it goes.
  useEffect(() => {
    if (seen.lost.length > 0) onLost(seen.lost);
  }, [seen.lost]);
}
