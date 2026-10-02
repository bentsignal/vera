import type { AuthClient } from "@convex-dev/better-auth/react";
import type { DiscoveredPds } from "@decentralized-convex/client";
import type { ReactNode } from "react";
import { createContext, use, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
// eslint-disable-next-line no-restricted-imports -- Expo Router has no route loaders to preload suspense queries.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { DecentralizedConvexClient } from "@decentralized-convex/client";
import { PdsQueryClient } from "@decentralized-convex/tanstack-query";
import { ConvexReactClient } from "convex/react";

import type { HomeAuthClient } from "./auth-client";
import { createHomeAuthClient } from "./auth-client";
import { createFederationAuthTokenFetcher } from "./federation-auth";
import { discoverHome } from "./home";

interface Session {
  readonly authClient: HomeAuthClient;
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
 * Finds the home PDS, then provides its Better Auth session, Convex client,
 * and federated TanStack queries to everything below.
 */
export function SessionProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const home = useQuery({
    queryFn: discoverHome,
    queryKey: ["vera", "home"],
    retry: 3,
    select: (discovered) => discovered,
    staleTime: Infinity,
  });
  if (home.data !== undefined) {
    return <HomeSession home={home.data}>{children}</HomeSession>;
  }
  if (home.isError) {
    return <Unreachable onRetry={() => void home.refetch()} />;
  }
  return fallback;
}

function HomeSession({
  children,
  home,
}: {
  children: ReactNode;
  home: DiscoveredPds;
}) {
  const queryClient = useQueryClient();
  const [session] = useState(() => ({
    authClient: createHomeAuthClient(home),
    home,
  }));
  const [convex] = useState(
    () =>
      new ConvexReactClient(home.manifest.deploymentUrl, {
        unsavedChangesWarning: false,
      }),
  );

  // Connect during the first render, because child effects start queries
  // before a parent effect would run. The effect reconnects whenever React
  // re-runs it (Fast Refresh does), since connecting again is a no-op.
  const [pdsQueryClient] = useState(() => {
    const client = new PdsQueryClient(
      new DecentralizedConvexClient({
        getAuthToken: createFederationAuthTokenFetcher(
          session.authClient,
          home,
        ),
        pds: { home },
      }),
    );
    client.connect(queryClient);
    return client;
  });
  // eslint-disable-next-line no-restricted-syntax -- Keeps the PDS query client attached to TanStack Query while mounted.
  useEffect(
    () => pdsQueryClient.connect(queryClient),
    [pdsQueryClient, queryClient],
  );

  return (
    <SessionContext value={session}>
      <ConvexBetterAuthProvider
        // The provider's type erases the concrete Better Auth plugins.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        authClient={session.authClient as unknown as AuthClient}
        client={convex}
      >
        {children}
      </ConvexBetterAuthProvider>
    </SessionContext>
  );
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
