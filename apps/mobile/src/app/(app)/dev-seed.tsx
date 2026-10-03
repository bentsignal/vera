import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";

import { useDevTools } from "~/features/dev/dev-tools";

/**
 * Dev PDS only: `vera:///dev-seed` gives the signed-in account the bot DMs,
 * group, and space, then opens Chats, so scripts can set up a simulator
 * without tapping through Settings.
 */
export default function DevSeedLink() {
  const devTools = useDevTools();
  const [done, setDone] = useState(!devTools.enabled);
  const started = useRef(false);
  // eslint-disable-next-line no-restricted-syntax -- Opening the link is the seed request; it runs once on arrival.
  useEffect(() => {
    if (!devTools.enabled || started.current) return;
    started.current = true;
    void devTools.seed().finally(() => setDone(true));
  }, [devTools]);
  if (done) return <Redirect href="/" />;
  return (
    <View className="bg-background flex-1 items-center justify-center gap-3">
      <ActivityIndicator />
      <Text className="text-subhead text-muted">
        Seeding bot conversations…
      </Text>
    </View>
  );
}
