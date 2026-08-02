import { useEffect, useState } from "react";
import { DecentralizedConvexClient } from "@decentralized-convex/client";
import {
  DecentralizedConvexProvider,
  useQuery,
} from "@decentralized-convex/react";
import { api } from "@vera/backend/api";

import type { HomeAuthClient } from "../auth-client.ts";
import type { HomeServer } from "../live/config.ts";
import { ChatRoom } from "./ChatRoom.tsx";
import { ServerLoading } from "./ServerLoading.tsx";

interface AuthenticatedSessionProps {
  authClient: HomeAuthClient;
  home: HomeServer;
  onChooseServer: () => void;
}

export function AuthenticatedSession(props: AuthenticatedSessionProps) {
  const user = useQuery(api.auth.currentUser);
  const client = useFederationClient(props.authClient, props.home);

  if (user === undefined || user === null || client === undefined) {
    return <ServerLoading home={props.home} />;
  }

  return (
    <DecentralizedConvexProvider client={client}>
      <ChatRoom
        home={props.home}
        onChooseServer={props.onChooseServer}
        onSignOut={() => props.authClient.signOut()}
        user={user}
      />
    </DecentralizedConvexProvider>
  );
}

function useFederationClient(authClient: HomeAuthClient, home: HomeServer) {
  const [client, setClient] = useState<DecentralizedConvexClient>();

  useEffect(() => {
    let active = true;
    const nextClient = new DecentralizedConvexClient({
      getAuthToken: async ({ url }) => {
        if (url !== home.convexUrl) return null;
        const token = await authClient.convex.token({
          fetchOptions: { throw: false },
        });
        return token.data?.token ?? null;
      },
    });
    queueMicrotask(() => {
      if (active) setClient(nextClient);
    });
    return () => {
      active = false;
      void nextClient.close();
    };
  }, [authClient, home.convexUrl]);

  return client;
}
