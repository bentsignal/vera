import type { AuthClient } from "@convex-dev/better-auth/react";
import { useState } from "react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";

import type { HomeServer } from "../live/config.ts";
import { createHomeAuthClient } from "../auth-client.ts";
import { SessionGate } from "./SessionGate.tsx";

interface HomeServerSessionProps {
  home: HomeServer;
  initialUsername: string;
  onChooseServer: () => void;
}

export function HomeServerSession({
  home,
  initialUsername,
  onChooseServer,
}: HomeServerSessionProps) {
  const [authClient] = useState(() =>
    createHomeAuthClient(home.siteUrl, `vera-${home.id}`),
  );
  const [convex] = useState(
    () => new ConvexReactClient(home.convexUrl, { expectAuth: true }),
  );
  // The provider's exported union loses the concrete plugin inference from createAuthClient.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const providerAuthClient = authClient as unknown as AuthClient;

  return (
    <ConvexBetterAuthProvider authClient={providerAuthClient} client={convex}>
      <SessionGate
        authClient={authClient}
        home={home}
        initialUsername={initialUsername}
        onChooseServer={onChooseServer}
      />
    </ConvexBetterAuthProvider>
  );
}
