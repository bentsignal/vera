import { useConvexAuth } from "convex/react";

import type { HomeAuthClient } from "../auth-client.ts";
import type { HomeServer } from "../live/config.ts";
import { AuthenticatedSession } from "./AuthenticatedSession.tsx";
import { AuthForm } from "./AuthForm.tsx";
import { ServerLoading } from "./ServerLoading.tsx";

interface SessionGateProps {
  authClient: HomeAuthClient;
  home: HomeServer;
  initialUsername: string;
  onChooseServer: () => void;
}

export function SessionGate(props: SessionGateProps) {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) return <ServerLoading home={props.home} />;
  if (!isAuthenticated) return <AuthForm {...props} />;
  return <AuthenticatedSession {...props} />;
}
