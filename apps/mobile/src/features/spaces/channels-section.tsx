import type { Space } from "@decentralized-convex/messages";
import { useRouter } from "expo-router";
import { FieldGroup } from "@expo/ui";

import { ListItem } from "~/components/list-item";
import { SectionHeaderWithAdd } from "~/components/section-header";
import { SectionTitle } from "~/components/section-title";
import { SymbolIcon } from "~/components/symbol-icon";
import { UnreadBadge } from "~/components/unread-badge";
import { useAccount } from "~/features/messaging/account";

export function ChannelsSection({ space }: { space: Space }) {
  const router = useRouter();
  const { address: account } = useAccount();
  return (
    <FieldGroup.Section>
      <FieldGroup.SectionHeader>
        {space.role === "owner" ? (
          <SectionHeaderWithAdd
            title="Text Channels"
            onAdd={() =>
              router.push({
                params: { account, spaceId: space.spaceId },
                pathname: "/new-channel",
              })
            }
          />
        ) : (
          <SectionTitle>Text Channels</SectionTitle>
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
                account,
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
