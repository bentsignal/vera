import type { DiscoveredPds } from "@decentralized-convex/client";
import type { ReactNode } from "react";
import { createContext, use } from "react";
import { Pressable, Text, View } from "react-native";
import { useQueries } from "@tanstack/react-query";

import type { AccountSession } from "./account-session";
import { env } from "~/env";
import { accountSession, verifyAccountSession } from "./account-session";
import { useStoredAccounts } from "./account-store";
import { discoverHome } from "./home";

interface Session {
  /** Every signed-in account, in the order they were added. */
  readonly accounts: readonly AccountSession[];
  /** The account Chats and Spaces are narrowed to, or null for all. */
  readonly filter: string | null;
  /** This build's home PDS, where new accounts sign in. */
  readonly home: DiscoveredPds;
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
      queryFn: () => discoverHome(domain),
      queryKey: ["vera", "home", domain],
      retry: 3,
      select: (discovered: DiscoveredPds) => discovered,
      staleTime: Infinity,
    })),
  });
  const homeByDomain = new Map(
    homes.flatMap((home, index) =>
      home.data === undefined ? [] : [[domains[index], home.data] as const],
    ),
  );
  const home = homeByDomain.get(env.veraDomain);
  if (homes.some((query) => query.isError)) {
    return (
      <Unreachable
        onRetry={() => {
          for (const query of homes) {
            if (query.isError) void query.refetch();
          }
        }}
      />
    );
  }
  if (home === undefined || homeByDomain.size < domains.length) {
    return fallback;
  }
  const accounts = stored.accounts.flatMap((account) => {
    const accountHome = homeByDomain.get(account.domain);
    return accountHome === undefined
      ? []
      : [accountSession(account, accountHome)];
  });
  return (
    <SessionContext value={{ accounts, filter: stored.filter, home }}>
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

function Unreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="bg-background flex-1 items-center justify-center gap-3 px-8">
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
