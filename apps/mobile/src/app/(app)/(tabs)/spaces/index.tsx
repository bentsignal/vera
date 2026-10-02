import { Platform, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import Add from "@expo/material-symbols/add.xml";

import { ScreenList } from "~/components/screen-list";
import { TabTitle } from "~/components/tab-title";
import { useVisibleAccounts } from "~/features/messaging/account";
import { useSpaces } from "~/features/messaging/spaces";
import { AccountToolbar } from "~/features/session/account-toolbar";
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

export default function SpacesScreen() {
  const router = useRouter();
  const { isLoading, spaces } = useSpaces();
  const showAccount = useVisibleAccounts().length > 1;
  return (
    <>
      <TabTitle title="Spaces" />
      <AccountToolbar>
        <Stack.Toolbar.Button
          icon={Platform.OS === "ios" ? "plus" : Add}
          accessibilityLabel="New space"
          onPress={() => router.push("/new-space")}
        />
      </AccountToolbar>
      <ScreenList
        ready={!isLoading}
        data={spaces}
        keyExtractor={(space) => space.key}
        ListEmptyComponent={isLoading ? null : <EmptySpaces />}
        renderItem={({ item }) => (
          <SpaceRow space={item} showAccount={showAccount} />
        )}
      />
    </>
  );
}
