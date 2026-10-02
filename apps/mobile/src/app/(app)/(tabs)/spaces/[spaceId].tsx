import { Alert } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, FieldGroup } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { useSpace, useSpaceActions } from "~/features/messaging/spaces";
import { ChannelsSection } from "~/features/spaces/channels-section";
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
  const { removeMember } = useSpaceActions();

  if (isLoading) return <Stack.Title>{name ?? ""}</Stack.Title>;
  if (space === undefined) return <Stack.Title>Space Not Found</Stack.Title>;

  function leave(name: string) {
    Alert.alert(`Leave ${name}?`, undefined, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          removeMember.mutate({ accountId: address, spaceId });
          router.back();
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
          <FieldGroup>
            <ChannelsSection space={space} />
            <MembersSection space={space} />
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
          </FieldGroup>
        </NativeHost>
      </Animated.View>
    </>
  );
}
