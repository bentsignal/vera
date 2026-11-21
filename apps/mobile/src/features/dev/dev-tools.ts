import { api } from "@vera/backend/api";
import { DEV_TOOLS_SECRET_HEADER } from "@vera/backend/dev-tools";

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
    headers: { [DEV_TOOLS_SECRET_HEADER]: env.devToolsSecret },
    method: "POST",
  });
  if (error === null) return finishPendingSignIn(pending);
  return "code" in error && error.code === "INVALID_USERNAME"
    ? `"${username}" isn't a valid username. Use letters and numbers.`
    : "The dev PDS refused it.";
}

/**
 * Dev PDS helpers, as the current account: seed bot conversations and have
 * bots answer.
 */
export function useDevTools() {
  const { session } = useAccount();
  const secret = env.devToolsSecret;
  return {
    enabled: env.devTools,
    /** Bots answer in the conversation, or in a thread with `threadId`. */
    replyToMe: (conversationId: string, threadId?: string) => {
      if (env.devTools) {
        void session.convex().then((convex) =>
          convex.action(api.dev.replyToMe, {
            conversationId,
            secret,
            threadId,
          }),
        );
      }
    },
    /** A long DM and a message ~200 back in it, to open there. */
    longThreadMiddle: async () => {
      const convex = await session.convex();
      return convex.action(api.dev.longThreadMiddle, { secret });
    },
    seed: async () => {
      const convex = await session.convex();
      return convex.action(api.dev.seed, { secret });
    },
    /** As many full conversations as the app saves on the device. */
    seedFull: async () => {
      const convex = await session.convex();
      return convex.action(api.dev.seedFull, { secret });
    },
  };
}
