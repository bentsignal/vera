import { FlatList } from "react-native";
import { Stack } from "expo-router";

import { SpaceRow } from "~/features/spaces/space-row";
import { spaces } from "~/mock/spaces";

export default function SpacesScreen() {
  return (
    <>
      <Stack.Title>Spaces</Stack.Title>
      <FlatList
        data={spaces}
        keyExtractor={(space) => space.id}
        contentInsetAdjustmentBehavior="automatic"
        className="bg-background"
        renderItem={({ item }) => <SpaceRow space={item} />}
      />
    </>
  );
}
