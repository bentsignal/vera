import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";

import type { ConversationSummary } from "./types";
import { Avatar } from "~/components/avatar";
import { SymbolIcon } from "~/components/symbol-icon";
import { usernameOf } from "~/features/messaging/profiles";
import { AffiliatedBadge } from "~/features/profile/affiliated-badge";
import { formatInboxTimestamp } from "~/lib/format";

const CHANNEL_GLYPH = { android: "tag", ios: "number" } as const;

/** The name, then a channel's space and the muted bell. */
function Title({ conversation }: { conversation: ConversationSummary }) {
  return (
    <View className="flex-1 flex-row items-center gap-1">
      <Text
        numberOfLines={1}
        className="text-headline text-foreground shrink font-semibold"
      >
        {conversation.title}
      </Text>
      {conversation.affiliated && <AffiliatedBadge size={15} />}
      {conversation.spaceName !== null && (
        <Text numberOfLines={1} className="text-subhead text-muted shrink-[2]">
          {conversation.spaceName}
        </Text>
      )}
      {conversation.muted && (
        <SymbolIcon
          accessibilityLabel="Alerts hidden"
          name={{ android: "notifications_off", ios: "bell.slash.fill" }}
          size={12}
          tintColorClassName="accent-muted"
        />
      )}
    </View>
  );
}

/** The title line: name, pin, account, time, and chevron. */
function TopLine({
  conversation,
  showAccount,
}: {
  conversation: ConversationSummary;
  showAccount: boolean;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Title conversation={conversation} />
      {conversation.pinnedAt !== null && (
        <SymbolIcon
          accessibilityLabel="Pinned"
          name={{ android: "push_pin", ios: "pin.fill" }}
          size={12}
          tintColorClassName="accent-accent"
        />
      )}
      {showAccount && (
        <Text numberOfLines={1} className="text-footnote text-accent">
          {usernameOf(conversation.account)}
        </Text>
      )}
      <Text className="text-subhead text-muted">
        {formatInboxTimestamp(conversation.lastActivityAt)}
      </Text>
      <SymbolIcon
        name={{ android: "chevron_right", ios: "chevron.right" }}
        size={12}
        weight="semibold"
        tintColorClassName="accent-subtle"
      />
    </View>
  );
}

/**
 * The row's look, with no touch handling: the unread dot, photo, title
 * line, and preview. `ConversationRow` makes it a link; on iOS the Inbox
 * hosts it inside a native SwiftUI row instead.
 */
export function ConversationRowContent({
  conversation,
  showAccount,
}: {
  conversation: ConversationSummary;
  /** Names the account the conversation belongs to, when several show. */
  showAccount: boolean;
}) {
  const { kind, title, lastMessage, unreadCount } = conversation;
  return (
    <View className="flex-1 flex-row items-center">
      {/* iMessage's unread dot sits in a gutter left of the photo. */}
      <View className="w-6 items-center">
        {unreadCount > 0 && (
          <View
            accessibilityLabel={`${unreadCount} unread`}
            className="bg-accent size-[10px] rounded-full"
          />
        )}
      </View>
      <Avatar
        name={title}
        size="list"
        uri={conversation.avatarUrl}
        glyph={kind === "channel" ? CHANNEL_GLYPH : undefined}
      />
      <View className="border-b-hairline border-separator ml-3 min-h-[78px] flex-1 justify-center self-stretch py-2.5 pr-4">
        <TopLine conversation={conversation} showAccount={showAccount} />
        <Text
          numberOfLines={2}
          className="text-subhead text-muted pt-0.5 leading-[20px]"
        >
          {lastMessage}
        </Text>
      </View>
    </View>
  );
}

/** A tappable Inbox row that opens the conversation. */
export function ConversationRow({
  conversation,
  showAccount,
}: {
  conversation: ConversationSummary;
  showAccount: boolean;
}) {
  const { account, id, title } = conversation;
  return (
    <Link
      href={{
        pathname: "/conversation/[conversationId]",
        params: { account, conversationId: id, title },
      }}
      asChild
    >
      <Pressable className="active:bg-fill flex-row">
        <ConversationRowContent
          conversation={conversation}
          showAccount={showAccount}
        />
      </Pressable>
    </Link>
  );
}
