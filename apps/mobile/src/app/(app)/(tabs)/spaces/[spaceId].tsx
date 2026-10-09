import { Alert } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, FieldGroup } from "@expo/ui";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { AccountScope, useAccount } from "~/features/messaging/account";
import {
  useSpace,
  useSpaceActions,
  useSpaceInviteLinks,
} from "~/features/messaging/spaces";
import { ChannelsSection } from "~/features/spaces/channels-section";
import { InboxSection } from "~/features/spaces/inbox-section";
import { InviteLinksSection } from "~/features/spaces/invite-links-section";
import { MembersSection } from "~/features/spaces/members-section";
import { destructive } from "~/lib/ui-modifiers";

export default function SpaceScreen() {
  const { account, name, spaceId } = useLocalSearchParams<{
    /** The signed-in account this space is opened as. */
    account?: string;
    name?: string;
    spaceId: string;
  }>();
  return (
    <AccountScope address={account}>
      <Space name={name} spaceId={spaceId} />
    </AccountScope>
  );
}

function Space({ name, spaceId }: { name?: string; spaceId: string }) {
  const router = useRouter();
  const { address } = useAccount();
  const { isLoading, space } = useSpace(spaceId);
  const links = useSpaceInviteLinks(spaceId);
  const { removeMember } = useSpaceActions();

  // Wait for the links too (unless the space is gone), so they don't pop in.
  if (isLoading || (space !== undefined && links.isLoading))
    return <Stack.Title>{name ?? ""}</Stack.Title>;
  if (space === undefined) return <Stack.Title>Space Not Found</Stack.Title>;

  function leave(name: string) {
    Alert.alert(`Leave ${name}?`, undefined, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          removeMember.mutate({ accountId: address, spaceId });
          // Back to the Spaces list, wherever the space was opened from.
          router.dismissTo("/spaces");
        },
        style: "destructive",
        text: "Leave",
      },
    ]);
  }

  return (
    <>
      <Stack.Title>{space.name}</Stack.Title>
      {/* Fades in once loaded instead of popping in. */}
      <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1 }}>
        <NativeHost style={{ flex: 1 }}>
          <FieldList>
            <ChannelsSection space={space} />
            <InboxSection space={space} />
            <MembersSection space={space} />
            <InviteLinksSection links={links.links} space={space} />
            {space.role !== "owner" && (
              <FieldGroup.Section>
                <Button
                  label="Leave Space"
                  variant="text"
                  modifiers={destructive}
                  onPress={() => leave(space.name)}
                />
              </FieldGroup.Section>
            )}
          </FieldList>
        </NativeHost>
      </Animated.View>
    </>
  );
}
