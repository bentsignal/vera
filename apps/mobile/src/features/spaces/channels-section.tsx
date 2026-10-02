import type { Space } from "@decentralized-convex/messages";
import { useRouter } from "expo-router";
import { FieldGroup, ListItem, Text } from "@expo/ui";

import { SectionHeaderWithAdd } from "~/components/section-header";
import { SymbolIcon } from "~/components/symbol-icon";
import { UnreadBadge } from "~/components/unread-badge";

export function ChannelsSection({ space }: { space: Space }) {
  const router = useRouter();
  return (
    <FieldGroup.Section>
      <FieldGroup.SectionHeader>
        {space.role === "owner" ? (
          <SectionHeaderWithAdd
            title="Text Channels"
            onAdd={() =>
              router.push({
                params: { spaceId: space.spaceId },
                pathname: "/new-channel",
              })
            }
          />
        ) : (
          <Text>Text Channels</Text>
        )}
      </FieldGroup.SectionHeader>
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
    </FieldGroup.Section>
  );
}
