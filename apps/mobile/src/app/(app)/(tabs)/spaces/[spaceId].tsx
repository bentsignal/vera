import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { FieldGroup, ListItem, Text } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { SymbolIcon } from "~/components/symbol-icon";
import { UnreadBadge } from "~/components/unread-badge";
import { secondaryTextStyle } from "~/lib/colors";
import { channelConversationId, findSpace } from "~/mock/spaces";

export default function SpaceScreen() {
  const router = useRouter();
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const space = findSpace(spaceId);

  if (!space) {
    return <Stack.Title>Space Not Found</Stack.Title>;
  }

  return (
    <>
      <Stack.Title>{space.name}</Stack.Title>
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup>
          <FieldGroup.Section>
            <Text>{space.description}</Text>
            <FieldGroup.SectionFooter>
              <Text>{`${space.memberCount} members`}</Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
          <FieldGroup.Section title="Text Channels">
            {space.channels.map((channel) => (
              <ListItem
                key={channel.id}
                leading={
                  <SymbolIcon
                    name={{ ios: "number", android: "tag" }}
                    size={20}
                    tintColorClassName="accent-accent"
                  />
                }
                supportingText={
                  <Text textStyle={secondaryTextStyle}>{channel.topic}</Text>
                }
                trailing={<UnreadBadge count={channel.unreadCount} />}
                onPress={() =>
                  router.push({
                    pathname: "/conversation/[conversationId]",
                    params: {
                      conversationId: channelConversationId(
                        space.id,
                        channel.id,
                      ),
                    },
                  })
                }
              >
                {channel.name}
              </ListItem>
            ))}
          </FieldGroup.Section>
        </FieldGroup>
      </NativeHost>
    </>
  );
}
