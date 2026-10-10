import type { DiscoveredPds } from "@decentralized-convex/client";
import { useState } from "react";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import { addStoredAccount, storedAccounts } from "./account-store";
import { createHomeAuthClient, PENDING_STORAGE_PREFIX } from "./auth-client";
import { useSession } from "./session-provider";

/** A sign-in or sign-up in progress, before it becomes a stored account. */
export interface PendingSignIn {
  readonly authClient: ReturnType<typeof createHomeAuthClient>;
  readonly home: DiscoveredPds;
}

const SESSION_KEYS = ["_cookie", "_session_data"] as const;

async function clearPending() {
  await Promise.all(
    SESSION_KEYS.map((suffix) =>
      SecureStore.deleteItemAsync(`${PENDING_STORAGE_PREFIX}${suffix}`),
    ),
  );
}

/**
 * Moves the session a pending sign-in just created into its own storage and
 * adds the account. Returns an error message, or null on success.
 */
export async function finishPendingSignIn({ authClient, home }: PendingSignIn) {
  const { data } = await authClient.getSession();
  const address = data?.user.email.toLowerCase();
  if (address === undefined) {
    await clearPending();
    return "Try again.";
  }
  if (storedAccounts().some((account) => account.address === address)) {
    // Don't leave a second session for an account that's already here.
    await authClient.signOut().catch(() => null);
    await clearPending();
    return `You're already signed in as ${address}.`;
  }
  const storagePrefix = `vera-${home.domain}-${Crypto.randomUUID()}`;
  for (const suffix of SESSION_KEYS) {
    const value = SecureStore.getItem(`${PENDING_STORAGE_PREFIX}${suffix}`);
    if (value !== null) SecureStore.setItem(`${storagePrefix}${suffix}`, value);
  }
  await clearPending();
  addStoredAccount({ address, domain: home.domain, storagePrefix });
  return null;
}

/** An auth client for signing in or creating one more account. */
export function usePendingSignIn() {
  const { home } = useSession();
  const [pending] = useState(() => ({
    authClient: createHomeAuthClient(home, PENDING_STORAGE_PREFIX),
    home,
  }));
  return pending;
}
