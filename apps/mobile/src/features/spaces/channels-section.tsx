import type { Space } from "@decentralized-convex/messages";
import { useRouter } from "expo-router";
import { Button, FieldGroup } from "@expo/ui";

import { SectionHeaderWithAdd } from "~/components/section-header";
import { SectionTitle } from "~/components/section-title";
import { useAccount } from "~/features/messaging/account";
import { useChannelSettings } from "~/features/messaging/channel-settings";
import { usePrefetchConversation } from "~/features/messaging/prefetch";
import { useSpaceChannels } from "~/features/messaging/spaces";
import { linkButton } from "~/lib/ui-modifiers";
import { channelMenuActions } from "./channel-actions";
import { ChannelRow } from "./channel-row";

/**
 * The space's text channels. Tap one to open it; touch and hold for its
 * settings (Show in Inbox, its alerts, and for owners Rename and Delete).
 */
export function ChannelsSection({ space }: { space: Space }) {
  const router = useRouter();
  const { address: account } = useAccount();
  const settings = useChannelSettings();
  const prefetch = usePrefetchConversation();
  const { channels, hasMore, loadMore } = useSpaceChannels(space);
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
      {channels.map((channel) => (
        <ChannelRow
          key={channel.conversationId}
          channel={channel}
          actions={channelMenuActions({
            channel,
            onRename: () =>
              router.push({
                params: {
                  account,
                  conversationId: channel.conversationId,
                  name: channel.name,
                  spaceId: space.spaceId,
                },
                pathname: "/new-channel",
              }),
            settings,
            space,
          })}
          onOpen={() => {
            prefetch(account, channel.conversationId);
            router.push({
              params: {
                account,
                conversationId: channel.conversationId,
                title: `#${channel.name}`,
              },
              pathname: "/conversation/[conversationId]",
            });
          }}
        />
      ))}
      {hasMore && (
        <Button
          label="Show More"
          variant="text"
          modifiers={linkButton}
          onPress={loadMore}
        />
      )}
    </FieldGroup.Section>
  );
}
