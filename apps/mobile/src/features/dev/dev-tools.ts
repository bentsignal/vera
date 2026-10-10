import { api } from "@vera/backend/api";

import type { PendingSignIn } from "~/features/session/pending-sign-in";
import { env } from "~/env";
import { useAccount } from "~/features/messaging/account";
import { finishPendingSignIn } from "~/features/session/pending-sign-in";

/**
 * Signs in without a passkey on the dev PDS (simulators cannot use
 * passkeys). Returns an error message, or null on success.
 */
export async function devSignIn(pending: PendingSignIn, username: string) {
  const { error } = await pending.authClient.$fetch("/dev/sign-in", {
    body: { username: username.trim().toLowerCase() },
    method: "POST",
  });
  if (error !== null) return "The dev PDS refused it.";
  return finishPendingSignIn(pending);
}

/**
 * Dev PDS helpers, as the current account: seed bot conversations and have
 * bots answer.
 */
export function useDevTools() {
  const { session } = useAccount();
  return {
    enabled: env.devTools,
    replyToMe: (conversationId: string) => {
      if (env.devTools) {
        void session
          .convex()
          .then((convex) =>
            convex.action(api.dev.replyToMe, { conversationId }),
          );
      }
    },
    /** A long DM and a message ~200 back in it, to open there. */
    longThreadMiddle: async () => {
      const convex = await session.convex();
      return convex.action(api.dev.longThreadMiddle, {});
    },
    seed: async () => {
      const convex = await session.convex();
      return convex.action(api.dev.seed, {});
    },
  };
}
