import { useEffect, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";

import { env } from "~/env";
import { useAuthFlow } from "~/features/auth/auth-flow";
import { usePendingSignIn } from "~/features/session/pending-sign-in";
import { devSignIn } from "./dev-tools";

/**
 * Dev PDS only: `vera-dev:///dev-sign-in?username=simtest` signs in without
 * a passkey or any typing, so simulators can be set up by scripts. Signed
 * in, the same link adds the account (see `dev-sign-in-path.ts`).
 */
export function DevSignInLink() {
  const { username } = useLocalSearchParams<{ username?: string }>();
  const pendingSignIn = usePendingSignIn();
  const { attempt } = useAuthFlow();
  const started = useRef(false);
  // eslint-disable-next-line no-restricted-syntax -- Opening the link is the sign-in request; it runs once on arrival.
  useEffect(() => {
    if (started.current || !env.devTools || username === undefined) return;
    started.current = true;
    void attempt("Dev Sign In Failed", () =>
      devSignIn(pendingSignIn, username),
    );
  }, [attempt, pendingSignIn, username]);
  if (!env.devTools || username === undefined) return <Redirect href="/" />;
  return (
    <View className="bg-background flex-1 items-center justify-center gap-3">
      <ActivityIndicator />
      <Text className="text-subhead text-muted">{`Signing in as ${username}…`}</Text>
    </View>
  );
}
