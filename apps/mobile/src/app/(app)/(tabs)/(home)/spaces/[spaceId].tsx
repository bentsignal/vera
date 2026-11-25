import { useState } from "react";
import { Alert } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { FieldGroup, Text } from "@expo/ui";

import { FieldList } from "~/components/field-list";
import { ListItem } from "~/components/list-item";
import { NativeHost } from "~/components/native-host";
import { AccountScope, useAccount } from "~/features/messaging/account";
import {
  useSpace,
  useSpaceActions,
  useSpaceInviteLinks,
} from "~/features/messaging/spaces";
import { AlertsSection } from "~/features/spaces/alerts-section";
import { ChannelsSection } from "~/features/spaces/channels-section";
import { InviteLinksSection } from "~/features/spaces/invite-links-section";
import { MembersSection } from "~/features/spaces/members-section";
import { markLeaving } from "~/features/spaces/removal";
import { nativeColors } from "~/lib/colors";

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

/**
 * The space's name once it has shown, and whether it has gone since (the
 * app's `useRemovedFromSpace` takes them back to Home then).
 */
function useGoneAfterShowing({
  isLoading,
  space,
}: ReturnType<typeof useSpace>) {
  const [name, setName] = useState<string>();
  if (space !== undefined && space.name !== name) setName(space.name);
  return {
    gone: name !== undefined && !isLoading && space === undefined,
    name,
  };
}

function Space({ name, spaceId }: { name?: string; spaceId: string }) {
  const router = useRouter();
  const { address } = useAccount();
  const found = useSpace(spaceId);
  const { isLoading, space } = found;
  const links = useSpaceInviteLinks(spaceId);
  const { removeMember } = useSpaceActions();
  const removed = useGoneAfterShowing(found);

  // Wait for the links too (unless the space is gone), so they don't pop in.
  if (isLoading || (space !== undefined && links.isLoading))
    return <Stack.Title>{name ?? ""}</Stack.Title>;
  // Gone after showing, the header stays as it was while the screen closes:
  // changing it then crashes Android's screen stack.
  if (removed.gone) return <Stack.Title>{removed.name}</Stack.Title>;
  if (space === undefined) return <Stack.Title>Space Not Found</Stack.Title>;

  function leave(name: string) {
    Alert.alert(`Leave ${name}?`, undefined, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          markLeaving(address, spaceId);
          removeMember.mutate({ accountId: address, spaceId });
          // Back to Home, wherever the space was opened from.
          router.dismissTo("/");
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
          <FieldList clearsTabBar>
            <ChannelsSection space={space} />
            <AlertsSection space={space} />
            <MembersSection space={space} />
            <InviteLinksSection links={links.links} space={space} />
            {space.role !== "owner" && (
              <FieldGroup.Section>
                {/* The whole row takes the tap, like Create Invite Link. */}
                <ListItem onPress={() => leave(space.name)}>
                  <Text textStyle={{ color: nativeColors.destructive }}>
                    Leave Space
                  </Text>
                </ListItem>
              </FieldGroup.Section>
            )}
          </FieldList>
        </NativeHost>
      </Animated.View>
    </>
  );
}
