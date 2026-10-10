import { useRef, useState } from "react";
import { Alert } from "react-native";
import { useRouter, useSegments } from "expo-router";

import { storedAccounts } from "~/features/session/account-store";

/**
 * The welcome and create-account screens run in two places: signed out,
 * and as a modal from Settings' "Add Account". Signed out, a new account
 * swaps the whole app in; adding one closes the modal.
 */
export function useAuthFlow() {
  const router = useRouter();
  const adding = useSegments()[0] === "(app)";
  const createAccountHref = adding
    ? "/add-account/create-account"
    : "/create-account";
  const [pending, setPending] = useState(false);
  const running = useRef(false);

  /**
   * Runs a sign-in or sign-up, which returns an error message, or null
   * when cancelled or successful. A passkey ceremony's result comes only
   * from the platform and the server, so it can't be shown optimistically:
   * `pending` stays true from the tap until the app moves on to the new
   * account, for a spinner, and a second tap meanwhile does nothing.
   */
  async function attempt(title: string, run: () => Promise<string | null>) {
    if (running.current) return;
    running.current = true;
    setPending(true);
    const before = storedAccounts().length;
    const error = await run();
    if (storedAccounts().length > before) {
      if (adding) router.dismissTo("/settings");
      return;
    }
    running.current = false;
    setPending(false);
    if (error !== null) Alert.alert(title, error);
  }

  return { adding, attempt, createAccountHref, pending } as const;
}
