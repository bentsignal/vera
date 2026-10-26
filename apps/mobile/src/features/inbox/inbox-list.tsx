import { Text, View } from "react-native";

import { ScreenList } from "~/components/screen-list";
import { markShown } from "~/features/dev/open-timing";
import { INBOX_ROW_HEIGHT } from "~/features/inbox/conversation-row";
import { filterInbox } from "~/features/inbox/filter";
import { InboxRow, ThreadInboxRow } from "~/features/inbox/inbox-row";
import { useVisibleAccounts } from "~/features/messaging/account";
import { useInbox } from "~/features/messaging/inbox";
import { useInboxThreads } from "~/features/messaging/thread-lists";
import { isDefaultInboxKinds } from "~/features/preferences/inbox-kinds";
import { usePreference } from "~/features/preferences/store";
import { useHomeOffline } from "~/features/saved/offline-pill";
import { useSavedHome } from "~/features/saved/show-saved";

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

/**
 * Home's Inbox page: every conversation, pinned first, and the threads
 * you follow among them, as filtered.
 */
export function InboxList() {
  const { conversations, isLoading } = useInbox();
  markShown("inbox", !isLoading);
  useSavedHome();
  const offline = useHomeOffline();
  const showAccount = useVisibleAccounts().length > 1;
  const show = usePreference("inboxShow");
  const kinds = usePreference("inboxIncludes");
  const threads = useInboxThreads({ enabled: kinds.includes("threads") });
  const filtered = show !== "all" || !isDefaultInboxKinds(kinds);
  const { pinned, rest } = filterInbox({
    conversations: conversations ?? [],
    kinds,
    show,
    threads,
  });
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
    if (kinds.length === 0) {
      return (
        <Empty
          title="Nothing Here"
          detail="Choose chats, channels, or threads in the filter."
        />
      );
    }
    return show === "unread" ? (
      <Empty title="All Caught Up" detail="There are no unread messages." />
    ) : (
      <Empty title="Nothing Here" detail="Nothing matches the filter." />
    );
  }

  return (
    <ScreenList
      offline={offline}
      ready={!isLoading}
      steady
      data={items}
      estimatedItemSize={INBOX_ROW_HEIGHT}
      keyExtractor={(item) => item.key}
      ListEmptyComponent={empty()}
      renderItem={({ item }) =>
        item.kind === "conversation" ? (
          <InboxRow
            conversation={item.conversation}
            showAccount={showAccount}
          />
        ) : (
          <ThreadInboxRow thread={item.thread} showAccount={showAccount} />
        )
      }
    />
  );
}
