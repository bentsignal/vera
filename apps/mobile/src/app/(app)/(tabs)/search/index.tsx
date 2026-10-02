import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { pdsMutation } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import type { SearchResult } from "~/features/search/use-search";
import { SymbolIcon } from "~/components/symbol-icon";
import { useSearchResults } from "~/features/search/use-search";

const ICONS = {
  channel: { android: "tag", ios: "number" },
  conversation: { android: "forum", ios: "bubble.left.and.bubble.right" },
  person: { android: "person", ios: "person.crop.circle" },
  space: { android: "grid_view", ios: "square.grid.2x2" },
} as const;

function ResultRow({
  result,
  onPress,
}: {
  result: SearchResult;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="active:bg-fill flex-row items-center gap-3 pl-4"
    >
      <SymbolIcon
        name={ICONS[result.kind]}
        size={22}
        tintColorClassName="accent-accent"
      />
      <View className="border-b-hairline border-separator flex-1 gap-0.5 py-3 pr-4">
        <Text numberOfLines={1} className="text-body text-foreground">
          {result.title}
        </Text>
        <Text numberOfLines={1} className="text-subhead text-muted">
          {result.subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const results = useSearchResults(query);
  const openDirect = useMutation(
    pdsMutation({ mutation: pds.messages.openDirect }),
  );

  async function open(result: SearchResult) {
    const { target } = result;
    if ("spaceId" in target) {
      router.push({ params: target, pathname: "/spaces/[spaceId]" });
      return;
    }
    const conversation =
      "conversationId" in target
        ? target
        : {
            conversationId: (await openDirect.mutateAsync(target))
              .conversationId,
            title: result.title,
          };
    router.push({
      params: conversation,
      pathname: "/conversation/[conversationId]",
    });
  }

  return (
    <>
      <Stack.Title>Search</Stack.Title>
      <Stack.SearchBar
        placeholder="People, chats, spaces"
        autoCapitalize="none"
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
      />
      <FlatList
        data={results}
        keyExtractor={(result) => result.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        className="bg-background"
        ListEmptyComponent={
          query.trim().length > 0 ? (
            <Text className="text-body text-muted pt-16 text-center">
              No results
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <ResultRow result={item} onPress={() => void open(item)} />
        )}
      />
    </>
  );
}
