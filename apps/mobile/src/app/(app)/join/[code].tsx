import { useLocalSearchParams } from "expo-router";

import { JoinSheet } from "~/features/spaces/join-sheet";

/** Opened by an invite link: `vera.chat/join/<code>`. */
export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <JoinSheet code={code} />;
}
