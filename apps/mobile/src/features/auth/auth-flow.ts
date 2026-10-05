import { Alert } from "react-native";
import { useRouter, useSegments } from "expo-router";

import { storedAccounts } from "~/features/session/account-store";

/**
 * The welcome, sign-in, and create-account screens run in two places: signed
 * out, and as a modal from Settings' "Add Account". Signed out, a new
 * account swaps the whole app in; adding one closes the modal.
 */
export function useAuthFlow() {
  const router = useRouter();
  const adding = useSegments()[0] === "(app)";
  const signInHref = adding ? "/add-account/sign-in" : "/sign-in";
  const createAccountHref = adding
    ? "/add-account/create-account"
    : "/create-account";

  /** Runs a sign-in, which returns an error message, or null when cancelled or successful. */
  async function attempt(title: string, run: () => Promise<string | null>) {
    const before = storedAccounts().length;
    const error = await run();
    if (error !== null) Alert.alert(title, error);
    else if (adding && storedAccounts().length > before) {
      router.dismissTo("/settings");
    }
  }

  return { adding, attempt, createAccountHref, signInHref } as const;
}
