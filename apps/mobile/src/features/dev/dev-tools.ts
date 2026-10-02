import { api } from "@vera/backend/api";
import { useConvex } from "convex/react";

import type { HomeAuthClient } from "~/features/session/auth-client";
import { env } from "~/env";

/**
 * Signs in without a passkey on the dev PDS (simulators cannot use
 * passkeys). Returns an error message, or null on success.
 */
export async function devSignIn(authClient: HomeAuthClient, username: string) {
  const { error } = await authClient.$fetch("/dev/sign-in", {
    body: { username: username.trim().toLowerCase() },
    method: "POST",
  });
  if (error !== null) return "Dev sign-in failed.";
  authClient.$store.notify("$sessionSignal");
  return null;
}

/** Dev PDS helpers: seed bot conversations and have bots answer. */
export function useDevTools() {
  const convex = useConvex();
  return {
    enabled: env.devTools,
    replyToMe: (conversationId: string) => {
      if (env.devTools) {
        void convex.action(api.dev.replyToMe, { conversationId });
      }
    },
    seed: () => convex.action(api.dev.seed, {}),
  };
}
