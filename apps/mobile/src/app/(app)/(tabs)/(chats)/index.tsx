import { Platform, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import EditSquare from "@expo/material-symbols/edit_square.xml";
import { pds } from "@vera/backend/pds";

import { ScreenList } from "~/components/screen-list";
import { TabTitle } from "~/components/tab-title";
import { ConversationRow } from "~/features/inbox/conversation-row";
import { useRunAs, useVisibleAccounts } from "~/features/messaging/account";
import { useInbox } from "~/features/messaging/conversations";
import { AccountToolbar } from "~/features/session/account-toolbar";

function EmptyInbox() {
  return (
    <View className="items-center gap-1 px-8 pt-24">
      <Text className="text-headline text-foreground font-semibold">
        No Conversations
      </Text>
      <Text className="text-subhead text-muted text-center">
        Start a conversation with the compose button.
      </Text>
    </View>
  );
}

export default function ChatsScreen() {
  const router = useRouter();
  const { conversations, isLoading } = useInbox();
  const runAs = useRunAs();
  const showAccount = useVisibleAccounts().length > 1;
  const visible = conversations ?? [];

  return (
    <>
      <TabTitle title="Chats" />
      <AccountToolbar>
        <Stack.Toolbar.Button
          icon={Platform.OS === "ios" ? "square.and.pencil" : EditSquare}
          accessibilityLabel="New message"
          onPress={() => router.push("/new-message")}
        />
      </AccountToolbar>
      <ScreenList
        ready={!isLoading}
        data={visible}
        keyExtractor={(conversation) => conversation.key}
        ListEmptyComponent={isLoading ? null : <EmptyInbox />}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            showAccount={showAccount}
            onMarkRead={() =>
              void runAs(
                item.account,
                pds.messages.markRead({
                  conversationId: item.id,
                  readAt: Date.now(),
                }),
              )
            }
            onLeave={() =>
              void runAs(
                item.account,
                pds.messages.leaveConversation({ conversationId: item.id }),
              )
            }
          />
        )}
      />
    </>
  );
}
