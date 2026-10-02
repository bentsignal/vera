import { useState } from "react";
import { FlatList, Platform, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import EditSquare from "@expo/material-symbols/edit_square.xml";

import type { ConversationSummary } from "~/features/inbox/types";
import { ConversationRow } from "~/features/inbox/conversation-row";
import { inbox } from "~/mock/inbox";

function matches(conversation: ConversationSummary, query: string) {
  const needle = query.trim().toLowerCase();
  return (
    conversation.title.toLowerCase().includes(needle) ||
    conversation.lastMessage.toLowerCase().includes(needle)
  );
}

function EmptyInbox({ searching }: { searching: boolean }) {
  return (
    <View className="items-center gap-1 px-8 pt-24">
      <Text className="text-headline text-foreground font-semibold">
        {searching ? "No Results" : "No Conversations"}
      </Text>
      <Text className="text-subhead text-muted text-center">
        {searching
          ? "Try a different name or message."
          : "Start a conversation with the compose button."}
      </Text>
    </View>
  );
}

export default function ChatsScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState(inbox);
  const [query, setQuery] = useState("");
  const visible = conversations.filter((conversation) =>
    matches(conversation, query),
  );

  function markRead(id: string) {
    setConversations((current) =>
      current.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
    );
  }

  function remove(id: string) {
    setConversations((current) => current.filter((c) => c.id !== id));
  }

  return (
    <>
      <Stack.Title>Chats</Stack.Title>
      <Stack.SearchBar
        placeholder="Search"
        onChangeText={(e) => setQuery(e.nativeEvent.text)}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={Platform.OS === "ios" ? "square.and.pencil" : EditSquare}
          accessibilityLabel="New message"
          onPress={() => router.push("/new-message")}
        />
      </Stack.Toolbar>
      <FlatList
        data={visible}
        keyExtractor={(conversation) => conversation.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        className="bg-background"
        ListEmptyComponent={<EmptyInbox searching={query.length > 0} />}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            onMarkRead={markRead}
            onDelete={remove}
          />
        )}
      />
    </>
  );
}
