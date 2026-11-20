import { Text, View } from "react-native";

import type { ThreadSummaryRow } from "./types";
import { Avatar } from "~/components/avatar";
import { SymbolIcon } from "~/components/symbol-icon";
import { RowMeta } from "./conversation-row";
import { replyCountLabel } from "./thread-links";

/**
 * A thread's Inbox row, with no touch handling: the unread dot, the
 * original's author, the conversation it's in, the original's text, and
 * its replies. As tall as a conversation's row (`INBOX_ROW_HEIGHT`).
 */
export function ThreadRowContent({
  thread,
  showAccount,
  separator = true,
}: {
  thread: ThreadSummaryRow;
  /** Names the account that follows it, when several show. */
  showAccount: boolean;
  /** Draws the hairline under the text (iOS's native rows draw their own). */
  separator?: boolean;
}) {
  const { rootAuthor, unreadCount } = thread;
  const replies = replyCountLabel(thread.replyCount);
  return (
    <View className="flex-1 flex-row items-center">
      <View className="w-6 items-center">
        {unreadCount > 0 && (
          <View
            accessibilityLabel="Unread"
            className="bg-accent size-[10px] rounded-full"
          />
        )}
      </View>
      <Avatar name={rootAuthor.name} size="list" uri={rootAuthor.avatarUrl} />
      <View
        className={`ml-3 min-h-[78px] flex-1 justify-center self-stretch py-2.5 pr-4 ${separator ? "border-b-hairline border-separator" : ""}`}
      >
        <View className="flex-row items-center gap-1.5">
          <View className="flex-1 flex-row items-center gap-1">
            <Text
              numberOfLines={1}
              className="text-headline text-foreground shrink font-semibold"
            >
              {rootAuthor.name}
            </Text>
            <SymbolIcon
              accessibilityLabel="Thread in"
              name={{ android: "forum", ios: "bubble.left.and.bubble.right" }}
              size={12}
              tintColorClassName="accent-muted"
            />
            <Text
              numberOfLines={1}
              className="text-subhead text-muted shrink-[2]"
            >
              {thread.conversationTitle}
            </Text>
          </View>
          <RowMeta
            account={thread.account}
            at={thread.lastActivityAt}
            showAccount={showAccount}
          />
        </View>
        <Text
          numberOfLines={1}
          className="text-subhead text-foreground pt-0.5 leading-[20px]"
        >
          {thread.rootText}
        </Text>
        <Text
          numberOfLines={1}
          className="text-subhead text-muted leading-[20px]"
        >
          {thread.latestReply.length > 0
            ? `${replies} · ${thread.latestReply}`
            : replies}
        </Text>
      </View>
    </View>
  );
}
