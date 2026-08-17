import type { AuthClient } from "@convex-dev/better-auth/react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import {
  DecentralizedConvexClient,
  discoverPds,
} from "@decentralized-convex/client";
import {
  DecentralizedConvexProvider,
  useQuery,
} from "@decentralized-convex/react";
import { PdsQueryClient } from "@decentralized-convex/tanstack-query";
import { api } from "@vera/backend/api";
import { ConvexReactClient, useConvexAuth } from "convex/react";

import type { HomeAuthClient } from "../pds/auth.ts";
import type { PdsHome } from "../pds/model.ts";
import { Conversation } from "../conversation/Conversation.tsx";
import {
  createFederationAuthTokenFetcher,
  createHomeAuthClient,
} from "../pds/auth.ts";
import { pdsHomeFromDiscovery, prototypeConversation } from "../pds/model.ts";
import { SignInForm } from "./SignInForm.tsx";

interface AccountSessionProps {
  home: PdsHome;
  initialUsername: string;
  onBack: () => void;
}

export function AccountSession(props: AccountSessionProps) {
  const [authClient] = useState(() => createHomeAuthClient(props.home));
  const [convex] = useState(
    () => new ConvexReactClient(props.home.convexUrl, { expectAuth: true }),
  );
  // Better Auth's provider erases the concrete plugins returned by createAuthClient.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const providerAuthClient = authClient as unknown as AuthClient;

  return (
    <ConvexBetterAuthProvider authClient={providerAuthClient} client={convex}>
      <SessionContent {...props} authClient={authClient} />
    </ConvexBetterAuthProvider>
  );
}

function SessionContent(
  props: AccountSessionProps & { authClient: HomeAuthClient },
) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <Connecting home={props.home} />;
  if (!isAuthenticated) {
    return (
      <SignInForm
        authClient={props.authClient}
        home={props.home}
        initialUsername={props.initialUsername}
        onBack={props.onBack}
      />
    );
  }
  return <AuthenticatedAccount {...props} />;
}

function AuthenticatedAccount({
  authClient,
  home,
  onBack,
}: AccountSessionProps & { authClient: HomeAuthClient }) {
  const user = useQuery(api.auth.currentUser);
  const federation = useConversationFederation(authClient, home);

  if (federation !== undefined && "error" in federation) {
    return (
      <main className="account-shell">
        <section className="account-panel auth-panel">
          <h1>Could not connect to the conversation</h1>
          <p className="auth-error">{federation.error.message}</p>
          <button className="primary-button" onClick={onBack} type="button">
            Back
          </button>
        </section>
      </main>
    );
  }

  if (user === undefined || user === null || federation === undefined) {
    return <Connecting home={home} />;
  }

  return (
    <DecentralizedConvexProvider client={federation.client}>
      <Conversation
        home={home}
        homes={federation.homes}
        onChangeAccount={onBack}
        onSignOut={() => authClient.signOut()}
        user={user}
      />
    </DecentralizedConvexProvider>
  );
}

function useConversationFederation(authClient: HomeAuthClient, home: PdsHome) {
  const queryClient = useQueryClient();
  const [federation, setFederation] = useState<
    | { client: DecentralizedConvexClient; homes: readonly PdsHome[] }
    | { error: Error }
  >();

  useEffect(() => {
    let active = true;
    let nextClient: DecentralizedConvexClient | undefined;
    let nextDisconnect: (() => void) | undefined;
    void Promise.all(
      prototypeConversation.participantDomains.map(async (domain) =>
        domain === home.domain
          ? home
          : pdsHomeFromDiscovery(await discoverPds(domain)),
      ),
    )
      .then((homes) => {
        if (!active) return;
        const client = new DecentralizedConvexClient({
          getAuthToken: createFederationAuthTokenFetcher({
            authClient,
            home,
            homes,
          }),
        });
        nextClient = client;
        const pdsQueryClient = new PdsQueryClient({
          client,
          mutationTarget: { id: home.domain, url: home.convexUrl },
          queryTargets: homes.map((server) => ({
            id: `member@${server.domain}`,
            url: server.convexUrl,
          })),
        });
        const disconnect = pdsQueryClient.connect(queryClient);
        nextDisconnect = disconnect;
        setFederation({ client, homes });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setFederation({
          error:
            cause instanceof Error ? cause : new Error("PDS discovery failed"),
        });
      });
    return () => {
      active = false;
      nextDisconnect?.();
      if (nextClient !== undefined) void nextClient.close();
    };
  }, [authClient, home, queryClient]);

  return federation;
}

function Connecting({ home }: { home: PdsHome }) {
  return (
    <main className="account-shell">
      <section className="account-panel loading-panel">
        <span className="loading-dot" />
        <p>Connecting to {home.domain}</p>
      </section>
    </main>
  );
}
