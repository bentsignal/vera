import type { DiscoveredPds } from "@decentralized-convex/client";
import type { ReactNode } from "react";
import { createContext, use, useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useQueries } from "@tanstack/react-query";

import type { AccountSession } from "./account-session";
import type { StoredAccount } from "./account-store";
import { env } from "~/env";
import { removeUnreachableAccount } from "~/features/settings/sign-out";
import { hideSplashWhenReady } from "~/features/updates/launch-splash";
import {
  accountSession,
  suspendAccountSession,
  verifyAccountSession,
} from "./account-session";
import { useStoredAccounts } from "./account-store";
import { discoverHome, savedHome } from "./home";

interface Session {
  /** Every signed-in account, in the order they were added. */
  readonly accounts: readonly AccountSession[];
  /** The account the Inbox and Spaces are narrowed to, or null for all. */
  readonly filter: string | null;
  /** This build's home PDS, where new accounts sign in. */
  readonly home: DiscoveredPds;
  /**
   * Signed-in accounts whose home PDS can't be found, such as one whose
   * server is down or gone, even with a home saved from an earlier launch.
   * They sit out until it's back or they're removed.
   */
  readonly unreachable: readonly StoredAccount[];
  /** Looks for the unreachable accounts' home PDSes again. */
  readonly retryUnreachable: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const session = use(SessionContext);
  if (session === null) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return session;
}

/**
 * Finds the home PDS of every signed-in account (and of this build, for new
 * sign-ins), then provides each account's live session to everything below.
 * An account whose home PDS can't be found sits out (More lists it)
 * rather than taking the other accounts down with it.
 */
export function SessionProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const stored = useStoredAccounts();
  const domains = [
    ...new Set([
      env.veraDomain,
      ...stored.accounts.map((account) => account.domain),
    ]),
  ];
  const homes = useQueries({
    queries: domains.map((domain) => ({
      // The home saved last launch starts the app right away, while the
      // lookup runs again in the background. If the home has changed, the
      // account's session moves to the new one.
      initialData: () => savedHome(domain),
      initialDataUpdatedAt: 0,
      queryFn: () => discoverHome(domain),
      queryKey: ["vera", "home", domain],
      // An account whose server can't be found comes back on its own once
      // the server is back.
      refetchInterval: (query: { state: { status: string } }) =>
        query.state.status === "error" ? 60_000 : false,
      retry: 3,
      select: (discovered: DiscoveredPds) => discovered,
      staleTime: (query: { state: { dataUpdatedAt: number } }) =>
        query.state.dataUpdatedAt === 0 ? 0 : Infinity,
    })),
  });
  const homeByDomain = new Map(
    homes.flatMap((home, index) =>
      home.data === undefined ? [] : [[domains[index], home.data] as const],
    ),
  );
  const home = homeByDomain.get(env.veraDomain);
  const { failed, online } = failedLookups(domains, homes);
  const unreachable = stored.accounts.filter((account) =>
    failed.has(account.domain),
  );
  for (const account of unreachable) suspendAccountSession(account);
  function retry() {
    for (const query of homes) {
      if (query.isError) void query.refetch();
    }
  }
  // Without this build's home there's nowhere to sign in, and with every
  // account unreachable the app would look signed out, so both take the
  // whole app to the Unreachable screen. With the network up, the
  // accounts' servers are what's gone, so it offers to remove them.
  if (
    failed.has(env.veraDomain) ||
    (unreachable.length > 0 && unreachable.length === stored.accounts.length)
  ) {
    return <Unreachable accounts={online ? unreachable : []} onRetry={retry} />;
  }
  if (home === undefined || homes.some((query) => query.isPending)) {
    return fallback;
  }
  const accounts = stored.accounts.flatMap((account) => {
    const accountHome = homeByDomain.get(account.domain);
    return accountHome === undefined || failed.has(account.domain)
      ? []
      : [accountSession(account, accountHome)];
  });
  // A filter on an account that's sitting out would leave the Inbox empty.
  const filter = unreachable.some(
    (account) => account.address === stored.filter,
  )
    ? null
    : stored.filter;
  return (
    <SessionContext
      value={{ accounts, filter, home, retryUnreachable: retry, unreachable }}
    >
      <HideSplash />
      <VerifySessions accounts={accounts} />
      {children}
    </SessionContext>
  );
}

interface HomeLookup {
  readonly data: DiscoveredPds | undefined;
  readonly dataUpdatedAt: number;
  readonly isError: boolean;
  readonly isSuccess: boolean;
}

/**
 * The domains whose home PDS lookup failed, and whether the network is up:
 * this build's home answered its lookup just now. A failed lookup counts
 * when there's no saved home to fall back on, or when the network is up:
 * then the domain's server is gone or down, and its saved home would only
 * keep reconnecting to a server that isn't there. Offline, every lookup
 * fails, and the saved homes show what's saved.
 */
function failedLookups(
  domains: readonly string[],
  homes: readonly HomeLookup[],
) {
  const buildHome = homes[domains.indexOf(env.veraDomain)];
  const online =
    buildHome !== undefined &&
    buildHome.isSuccess &&
    buildHome.dataUpdatedAt > 0;
  const failed = new Set(
    domains.filter((_, index) => {
      const lookup = homes[index];
      return (
        lookup !== undefined &&
        lookup.isError &&
        (lookup.data === undefined || online)
      );
    }),
  );
  return { failed, online };
}

/** Drops accounts whose sessions ended elsewhere, once per app run. */
function VerifySessions({ accounts }: { accounts: readonly AccountSession[] }) {
  useQueries({
    queries: accounts.map((account) => ({
      queryFn: () => verifyAccountSession(account),
      queryKey: ["vera", "verify-session", account.storagePrefix],
      select: (valid: boolean) => valid,
      staleTime: Infinity,
    })),
  });
  return null;
}

/**
 * Hides the native splash screen (a plain background) once the session has
 * something to show: the app, or the screen saying the server can't be
 * reached. Until then the splash stays up so nothing flashes.
 */
function HideSplash() {
  // eslint-disable-next-line no-restricted-syntax -- The native splash screen hides once, when the first real screen mounts.
  useEffect(() => {
    hideSplashWhenReady();
  }, []);
  return null;
}

/**
 * Says the app can't reach Vera, or, given the `accounts` whose servers
 * are gone while the network is up, those accounts' servers, with a way
 * to remove them so the app isn't stuck here.
 */
function Unreachable({
  accounts,
  onRetry,
}: {
  accounts: readonly StoredAccount[];
  onRetry: () => void;
}) {
  const domains = [...new Set(accounts.map((account) => account.domain))];
  return (
    <View className="bg-background flex-1 items-center justify-center gap-3 px-8">
      <HideSplash />
      <Text className="text-title3 text-foreground text-center font-semibold">
        {domains.length === 0
          ? "Can't reach Vera"
          : `Can't reach ${domains.join(", ")}`}
      </Text>
      <Text className="text-subhead text-muted text-center">
        {accounts.length === 0
          ? "Check your connection and try again."
          : accounts.map((account) => account.address).join("\n")}
      </Text>
      <Pressable accessibilityRole="button" onPress={onRetry}>
        <Text className="text-body text-accent font-semibold">Try Again</Text>
      </Pressable>
      {accounts.length > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            for (const account of accounts) removeUnreachableAccount(account);
          }}
        >
          <Text className="text-body text-destructive font-semibold">
            {accounts.length === 1 ? "Remove Account" : "Remove Accounts"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
