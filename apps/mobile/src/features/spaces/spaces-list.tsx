import { Text, View } from "react-native";

import { ScreenList } from "~/components/screen-list";
import { useVisibleAccounts } from "~/features/messaging/account";
import { useSpaces } from "~/features/messaging/spaces";
import { usePreference } from "~/features/preferences/store";
import { useHomePill } from "~/features/saved/offline-pill";
import { sortSpaces } from "~/features/spaces/sort";
import { SpaceRow } from "~/features/spaces/space-row";

function EmptySpaces() {
  return (
    <View className="items-center gap-1 px-8 pt-24">
      <Text className="text-headline text-foreground font-semibold">
        No Spaces
      </Text>
      <Text className="text-subhead text-muted text-center">
        Create a space to group conversations into channels.
      </Text>
    </View>
  );
}

/**
 * Home's Spaces page: your spaces in sort order. Invitations are answered
 * in Activity.
 */
export function SpacesList() {
  const { isLoading, spaces } = useSpaces();
  const sort = usePreference("spacesSort");
  const showAccount = useVisibleAccounts().length > 1;
  const pill = useHomePill();
  return (
    <ScreenList
      offline={pill.offline}
      pill={pill.shown}
      ready={!isLoading}
      steady
      data={sortSpaces(spaces, sort)}
      keyExtractor={(space) => space.key}
      ListEmptyComponent={<EmptySpaces />}
      renderItem={({ item }) => (
        <SpaceRow space={item} showAccount={showAccount} />
      )}
    />
  );
}
