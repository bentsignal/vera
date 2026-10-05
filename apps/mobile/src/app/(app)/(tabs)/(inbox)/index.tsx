import { Platform, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import EditSquare from "@expo/material-symbols/edit_square.xml";

import { ScreenList } from "~/components/screen-list";
import { TabTitle } from "~/components/tab-title";
import { filterInbox } from "~/features/inbox/filter";
import { FilterToolbar } from "~/features/inbox/filter-toolbar";
import { InboxRow } from "~/features/inbox/inbox-row";
import { useVisibleAccounts } from "~/features/messaging/account";
import { useInbox } from "~/features/messaging/conversations";
import { usePreference } from "~/features/preferences/store";
import { AccountToolbar } from "~/features/session/account-toolbar";

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <View className="items-center gap-1 px-8 pt-24">
      <Text className="text-headline text-foreground font-semibold">
        {title}
      </Text>
      <Text className="text-subhead text-muted text-center">{detail}</Text>
    </View>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const { conversations, isLoading } = useInbox();
  const showAccount = useVisibleAccounts().length > 1;
  const show = usePreference("inboxShow");
  const from = usePreference("inboxFrom");
  const filtered = show !== "all" || from !== "everything";
  const { pinned, rest } = filterInbox(conversations ?? [], show, from);
  const items = [...pinned, ...rest];

  function empty() {
    if (isLoading) return null;
    if (!filtered) {
      return (
        <Empty
          title="No Conversations"
          detail="Start a conversation with the compose button."
        />
      );
    }
    return show === "unread" ? (
      <Empty title="All Caught Up" detail="There are no unread messages." />
    ) : (
      <Empty title="Nothing Here" detail="No conversations match the filter." />
    );
  }

  return (
    <>
      <TabTitle title="Inbox" />
      <FilterToolbar show={show} from={from} />
      <AccountToolbar>
        <Stack.Toolbar.Button
          icon={Platform.OS === "ios" ? "square.and.pencil" : EditSquare}
          accessibilityLabel="New message"
          onPress={() => router.push("/new-message")}
        />
      </AccountToolbar>
      <ScreenList
        ready={!isLoading}
        data={items}
        keyExtractor={(item) => item.key}
        ListEmptyComponent={empty()}
        renderItem={({ item }) => (
          <InboxRow conversation={item} showAccount={showAccount} />
        )}
      />
    </>
  );
}
