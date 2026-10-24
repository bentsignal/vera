import type { DiscoveredPds } from "@decentralized-convex/client";
import { notifyManager, QueryClient } from "@tanstack/react-query";
import { DecentralizedConvexClient } from "@decentralized-convex/client";
import {
  PdsQueryClient,
  pdsSessionQueryKey,
} from "@decentralized-convex/tanstack-query";
import { ConvexHttpClient } from "convex/browser";

import type { StoredAccount } from "./account-store";
import { env } from "~/env";
import { delayedConnection } from "~/features/dev/server-delay";
import { forgetAccountNotifications } from "~/features/notifications/presented";
import { forgetSaved } from "~/features/saved/saved-files";
import { removeStoredAccount, storedAccounts } from "./account-store";
import { createHomeAuthClient } from "./auth-client";
import {
  createFederationAuthTokenFetcher,
  forgetHomeToken,
  homeToken,
} from "./federation-auth";

/**
 * The app's one TanStack cache. Every signed-in account's PDS queries live
 * here, keyed by the account's address. A screen closed in the last ten
 * minutes (as long as a conversation reuses its pages) shows its last
 * results right away when it opens again.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { gcTime: 10 * 60 * 1000 } },
});

// How often screens learn of new query results: in the next frame, but at
// most every `NOTIFY_GAP_MS`. A busy conversation sends many updates a
// second (each message, read state, typing, the inbox behind it), each a
// separate message on the connection, and each redrew the app on its own;
// every redraw has a cost however little changed. While something you did
// is on its way (a mutation), they show in the next frame, so what it
// changes shows at once; so does a query's first result, which a screen
// opening or a page of older messages is waiting on (the throttle held
// each of those up by as much again).
const NOTIFY_GAP_MS = 400;
let notifiedAt = -Infinity;
/** A query got its first result since screens last heard. */
let firstResult = false;
/** Queries that have had a result (a PDS query starts out `loading`). */
const answered = new WeakSet<object>();
function isLoading(data: unknown) {
  return (
    typeof data === "object" &&
    data !== null &&
    "status" in data &&
    data.status === "loading"
  );
}
queryClient.getQueryCache().subscribe((event) => {
  // Before the notification it brings reaches the scheduler: the cache
  // tells its listeners straight away, and screens through the scheduler.
  if (
    event.type === "updated" &&
    event.action.type === "success" &&
    !answered.has(event.query) &&
    !isLoading(event.query.state.data)
  ) {
    answered.add(event.query);
    firstResult = true;
  }
});
/** Whether something you did is on its way (not `background` upkeep). */
function yoursPending() {
  return (
    queryClient.isMutating({
      predicate: (mutation) => mutation.meta?.background !== true,
    }) > 0
  );
}
let notifyTimer: ReturnType<typeof setTimeout> | undefined;
const notifies = new Array<() => void>();
function notifyNow() {
  clearTimeout(notifyTimer);
  notifyTimer = undefined;
  firstResult = false;
  requestAnimationFrame(() => {
    notifiedAt = performance.now();
    for (const notify of notifies.splice(0)) notify();
  });
}
notifyManager.setScheduler((notify) => {
  notifies.push(notify);
  const yours = firstResult || yoursPending();
  if (notifies.length > 1 && !yours) return;
  const wait = notifiedAt + NOTIFY_GAP_MS - performance.now();
  if (wait <= 0 || yours) notifyNow();
  else notifyTimer ??= setTimeout(notifyNow, wait);
});

/** Something that runs for each account session while it lasts. */
type SessionStart = (account: StoredAccount) => () => void;

const sessionStarts = new Set<SessionStart>();

/**
 * Runs `start` for each account session as it starts, and what it returns
 * as the session ends. Install it before the first session starts.
 */
export function onAccountSession(start: SessionStart) {
  sessionStarts.add(start);
}

function createAccountSession(stored: StoredAccount, home: DiscoveredPds) {
  const authClient = createHomeAuthClient(home, stored.storagePrefix);
  const transport = new DecentralizedConvexClient({
    ...(env.devTools && { connectionFactory: delayedConnection }),
    getAuthToken: createFederationAuthTokenFetcher(
      authClient,
      home,
      stored.storagePrefix,
    ),
    pds: { home },
  });
  const pdsClient = new PdsQueryClient(transport, {
    session: stored.address,
  });
  pdsClient.connect(queryClient);
  // Connects and signs in while the first screen renders, rather than once
  // its queries start.
  transport.connectHome();
  const started = [...sessionStarts].map((start) => start(stored));
  // The Better Auth client is a Proxy that answers every property, so it
  // stays out of this object: in development React reads the props it
  // re-renders with to log them, and turning the proxy's `name` into text
  // throws mid-commit, which froze the app when an account signed out.
  return {
    address: stored.address,
    /** Ends this account's session on its home PDS. */
    authSignOut: () => authClient.signOut(),
    /** This account's session on its home PDS, or null once it's ended. */
    authSession: () => authClient.getSession(),
    /** A Convex client for the home deployment, signed in as this account. */
    convex: async () => {
      const client = new ConvexHttpClient(home.manifest.deploymentUrl);
      const token = await homeToken(authClient);
      if (token !== null) client.setAuth(token);
      return client;
    },
    home,
    pds: pdsClient,
    /** Stops what `onAccountSession` started for it. */
    end: () => {
      for (const stop of started) stop();
    },
    storagePrefix: stored.storagePrefix,
    transport,
    username: stored.address.slice(0, stored.address.lastIndexOf("@")),
  };
}

export type AccountSession = ReturnType<typeof createAccountSession>;

const sessions = new Map<string, AccountSession>();

/**
 * The live session for a stored account, created once per app run, or
 * again if its home PDS turns out to have changed since the app started
 * with the one saved last time.
 */
export function accountSession(stored: StoredAccount, home: DiscoveredPds) {
  const existing = sessions.get(stored.storagePrefix);
  if (existing?.home === home) return existing;
  if (existing !== undefined) {
    existing.end();
    existing.pds.disconnect(queryClient);
    void existing.transport.close();
  }
  const session = createAccountSession(stored, home);
  sessions.set(stored.storagePrefix, session);
  return session;
}

/** The live session of a signed-in address, if there is one. */
export function liveSession(address: string) {
  return [...sessions.values()].find((session) => session.address === address);
}

/** Forgets an account on this device and drops its cached data. */
export function closeAccountSession(session: AccountSession) {
  removeStoredAccount(session.address);
  forgetHomeToken(session.storagePrefix);
  session.end();
  forgetSaved(session.storagePrefix);
  sessions.delete(session.storagePrefix);
  session.pds.disconnect(queryClient);
  void session.transport.close();
  queryClient.removeQueries({ queryKey: pdsSessionQueryKey(session.address) });
  void forgetAccountNotifications(
    session.address,
    storedAccounts().length,
  ).catch(() => null);
}

/**
 * Removes the account if its home PDS says the session is gone, such as
 * after signing out elsewhere. Network failures keep it.
 */
export async function verifyAccountSession(session: AccountSession) {
  const { data, error } = await session.authSession();
  if (error === null && data === null) closeAccountSession(session);
  return data !== null;
}
