import type { DiscoveredPds } from "@decentralized-convex/client";
import type { ReactNode } from "react";
import { createContext, use, useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useQueries } from "@tanstack/react-query";

import type { AccountSession } from "./account-session";
import type { StoredAccount } from "./account-store";
import { env } from "~/env";
import { accountSession, verifyAccountSession } from "./account-session";
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
   * server is down or gone. They sit out until it's back or they're removed.
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
  // A failed lookup only matters without a saved home to fall back on.
  const failed = new Set(
    domains.filter(
      (_, index) =>
        homes[index]?.isError === true && homes[index].data === undefined,
    ),
  );
  const unreachable = stored.accounts.filter((account) =>
    failed.has(account.domain),
  );
  function retry() {
    for (const query of homes) {
      if (query.isError) void query.refetch();
    }
  }
  // Without this build's home there's nowhere to sign in, and with every
  // account unreachable the app would look signed out, so both take the
  // whole app to the Unreachable screen.
  if (
    failed.has(env.veraDomain) ||
    (unreachable.length > 0 && unreachable.length === stored.accounts.length)
  ) {
    return <Unreachable onRetry={retry} />;
  }
  if (home === undefined || homes.some((query) => query.isPending)) {
    return fallback;
  }
  const accounts = stored.accounts.flatMap((account) => {
    const accountHome = homeByDomain.get(account.domain);
    return accountHome === undefined
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
    void SplashScreen.hideAsync();
  }, []);
  return null;
}

function Unreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="bg-background flex-1 items-center justify-center gap-3 px-8">
      <HideSplash />
      <Text className="text-title3 text-foreground font-semibold">
        Can't reach Vera
      </Text>
      <Text className="text-subhead text-muted text-center">
        Check your connection and try again.
      </Text>
      <Pressable accessibilityRole="button" onPress={onRetry}>
        <Text className="text-body text-accent font-semibold">Try Again</Text>
      </Pressable>
    </View>
  );
}
