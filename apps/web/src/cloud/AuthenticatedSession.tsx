import { useEffect, useState } from "react";
import {
  DecentralizedConvexClient,
  discoverPds,
} from "@decentralized-convex/client";
import {
  DecentralizedConvexProvider,
  useQuery,
} from "@decentralized-convex/react";
import { api } from "@vera/backend/api";

import type { HomeAuthClient } from "../auth-client.ts";
import type { HomeServer } from "../live/config.ts";
import { createFederationAuthTokenFetcher } from "../federation-auth.ts";
import { conversation, homeFromDiscovery } from "../live/config.ts";
import { ChatRoom } from "./ChatRoom.tsx";
import { ServerLoading } from "./ServerLoading.tsx";

interface AuthenticatedSessionProps {
  authClient: HomeAuthClient;
  home: HomeServer;
  onChooseServer: () => void;
}

export function AuthenticatedSession(props: AuthenticatedSessionProps) {
  const user = useQuery(api.auth.currentUser);
  const federation = useFederationClient(props.authClient, props.home);

  if (federation !== undefined && "error" in federation) {
    return (
      <main className="account-shell">
        <section className="account-panel auth-panel">
          <h1>Could not connect to the conversation</h1>
          <p className="auth-error">{federation.error.message}</p>
          <button
            className="primary-button"
            onClick={props.onChooseServer}
            type="button"
          >
            Back
          </button>
        </section>
      </main>
    );
  }

  if (user === undefined || user === null || federation === undefined) {
    return <ServerLoading home={props.home} />;
  }

  return (
    <DecentralizedConvexProvider client={federation.client}>
      <ChatRoom
        conversationHomes={federation.homes}
        home={props.home}
        onChooseServer={props.onChooseServer}
        onSignOut={() => props.authClient.signOut()}
        user={user}
      />
    </DecentralizedConvexProvider>
  );
}

function useFederationClient(authClient: HomeAuthClient, home: HomeServer) {
  const [federation, setFederation] = useState<
    | { client: DecentralizedConvexClient; homes: readonly HomeServer[] }
    | { error: Error }
  >();

  useEffect(() => {
    let active = true;
    let nextClient: DecentralizedConvexClient | undefined;
    void Promise.all(
      conversation.participantDomains.map(async (domain) =>
        domain === home.domain
          ? home
          : homeFromDiscovery(await discoverPds(domain)),
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
      if (nextClient !== undefined) void nextClient.close();
    };
  }, [authClient, home]);

  return federation;
}
