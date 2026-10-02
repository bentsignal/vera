import type { Space } from "@decentralized-convex/messages";
import { useRouter } from "expo-router";
import { Button, FieldGroup, ListItem, Text } from "@expo/ui";

import { SymbolIcon } from "~/components/symbol-icon";
import { UnreadBadge } from "~/components/unread-badge";

export function ChannelsSection({ space }: { space: Space }) {
  const router = useRouter();
  return (
    <FieldGroup.Section title="Text Channels">
      {space.channels.map((channel) => (
        <ListItem
          key={channel.conversationId}
          leading={
            <SymbolIcon
              name={{ android: "tag", ios: "number" }}
              size={20}
              tintColorClassName="accent-accent"
            />
          }
          trailing={<UnreadBadge count={channel.unreadCount} />}
          onPress={() =>
            router.push({
              params: {
                conversationId: channel.conversationId,
                title: `#${channel.name}`,
              },
              pathname: "/conversation/[conversationId]",
            })
          }
        >
          {channel.name}
        </ListItem>
      ))}
      {space.role === "owner" && (
        <Button
          onPress={() =>
            router.push({
              params: { spaceId: space.spaceId },
              pathname: "/new-channel",
            })
          }
        >
          <Text>New Channel</Text>
        </Button>
      )}
    </FieldGroup.Section>
  );
}
