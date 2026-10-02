import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";

import type { ConversationSummary } from "./types";
import { Avatar } from "~/components/avatar";
import { UnreadBadge } from "~/components/unread-badge";
import { formatInboxTimestamp } from "~/lib/format";

export function ConversationRow({
  conversation,
  onMarkRead,
  onDelete,
}: {
  conversation: ConversationSummary;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { id, title, lastMessage, lastActivityAt, unreadCount } = conversation;
  return (
    <Link
      href={{
        pathname: "/conversation/[conversationId]",
        params: { conversationId: id },
      }}
      asChild
    >
      <Link.Trigger>
        <Pressable className="active:bg-fill flex-row items-center gap-3 pl-4">
          <Avatar name={title} />
          <View className="border-b-hairline border-separator flex-1 gap-0.5 py-3 pr-4">
            <View className="flex-row items-baseline gap-2">
              <Text
                numberOfLines={1}
                className="text-headline text-foreground flex-1 font-semibold"
              >
                {title}
              </Text>
              <Text className="text-subhead text-muted">
                {formatInboxTimestamp(lastActivityAt)}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text
                numberOfLines={2}
                className="text-subhead text-muted flex-1"
              >
                {lastMessage}
              </Text>
              <UnreadBadge count={unreadCount} />
            </View>
          </View>
        </Pressable>
      </Link.Trigger>
      <Link.Preview />
      <Link.Menu>
        <Link.MenuAction
          title="Mark as Read"
          icon="envelope.open"
          disabled={unreadCount === 0}
          onPress={() => onMarkRead(id)}
        />
        <Link.MenuAction
          title="Delete"
          icon="trash"
          destructive
          onPress={() => onDelete(id)}
        />
      </Link.Menu>
    </Link>
  );
}
