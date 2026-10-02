import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";

import { env } from "~/env";
import { devSignIn } from "~/features/dev/dev-tools";
import { usePendingSignIn } from "~/features/session/pending-sign-in";

/**
 * Dev PDS only: `vera:///dev-sign-in?username=simtest` signs in without a
 * passkey or any typing, so simulators can be set up by scripts.
 */
export default function DevSignInLink() {
  const { username } = useLocalSearchParams<{ username?: string }>();
  const pendingSignIn = usePendingSignIn();
  // eslint-disable-next-line no-restricted-syntax -- Opening the link is the sign-in request; it runs once on arrival.
  useEffect(() => {
    if (env.devTools && username !== undefined) {
      void devSignIn(pendingSignIn, username);
    }
  }, [pendingSignIn, username]);
  if (!env.devTools || username === undefined) return <Redirect href="/" />;
  return (
    <View className="bg-background flex-1 items-center justify-center gap-3">
      <ActivityIndicator />
      <Text className="text-subhead text-muted">{`Signing in as ${username}…`}</Text>
    </View>
  );
}
