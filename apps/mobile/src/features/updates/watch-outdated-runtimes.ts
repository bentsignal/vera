import { useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import * as Updates from "expo-updates";
import { DecentralizedConvexClient } from "@decentralized-convex/client";
import { api } from "@vera/backend/api";

import { useSession } from "~/features/session/session-provider";
import { combineOutdated, mustReplaceBinary, readOutdated } from "./store-gate";

/** Its own signed-out connection, like `WatchBreakingVersion`'s. */
const transport = new DecentralizedConvexClient();

let outdated = readOutdated(undefined);
const listeners = new Set<() => void>();

function noteOutdated(next: ReturnType<typeof readOutdated>) {
  outdated = next;
  for (const listener of listeners) listener();
}

/**
 * Watches this build's home PDS for the outdated runtimes (see
 * services/backend/outdated-runtimes.ts), in store builds only. A deploy
 * re-runs the query, so a binary listed hears it the moment the deploy
 * goes live, without an update to its code.
 */
export function WatchOutdatedRuntimes() {
  const url = useSession().home.manifest.deploymentUrl;
  // eslint-disable-next-line no-restricted-syntax -- A live subscription that drives the app's update state, not data any screen renders, so it doesn't belong in TanStack Query.
  useEffect(() => {
    // Only store builds can be listed (see `mustReplaceBinary`): dev,
    // internal, and preview builds don't subscribe at all.
    if (Updates.channel !== "production") return undefined;
    const observer = transport.watchQuery({
      args: {},
      // A PDS from before the list answers with an error: nothing listed.
      combine: combineOutdated,
      query: api.release.outdatedRuntimes,
      targets: [{ id: "home", url }],
    });
    const stop = observer.subscribe(() => {
      noteOutdated(observer.getSnapshot().data);
    });
    return () => {
      stop();
      observer.close();
    };
  }, [url]);
  return null;
}

/**
 * Whether this binary has to be replaced from the store
 * (`mustReplaceBinary`); `StoreUpdateCover` shows it.
 */
export function useMustReplaceBinary() {
  const listed = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => outdated,
  );
  return mustReplaceBinary({
    channel: Updates.channel,
    outdated: listed,
    platform: Platform.OS,
    runtime: Updates.runtimeVersion,
  });
}
