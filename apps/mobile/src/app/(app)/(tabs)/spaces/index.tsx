import {
  ActivityIndicator,
  FlatList,
  Platform,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import Add from "@expo/material-symbols/add.xml";

import { useSpaces } from "~/features/messaging/spaces";
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
  return (
    <>
      <Stack.Title>Spaces</Stack.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={Platform.OS === "ios" ? "plus" : Add}
          accessibilityLabel="New space"
          onPress={() => router.push("/new-space")}
        />
      </Stack.Toolbar>
      <FlatList
        data={spaces}
        keyExtractor={(space) => space.spaceId}
        contentInsetAdjustmentBehavior="automatic"
        className="bg-background"
        ListEmptyComponent={
          isLoading ? <ActivityIndicator className="pt-24" /> : <EmptySpaces />
        }
        renderItem={({ item }) => <SpaceRow space={item} />}
      />
    </>
  );
}
