import { Alert } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { directConversationId } from "@decentralized-convex/messages";
import { Button, FieldGroup, Text } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { useConversationActions } from "~/features/messaging/conversations";
import { useProfile } from "~/features/messaging/profiles";
import { ProfileCard } from "~/features/profile/profile-card";
import { fillWidth, plainRow, prominentButton } from "~/lib/ui-modifiers";

/** Opens (or starts) the direct conversation with `address`. */
function MessageButton({ address, name }: { address: string; name: string }) {
  const router = useRouter();
  const { address: account } = useAccount();
  const { openDirect } = useConversationActions();

  // Opens right away: the conversation's ID comes from the two addresses.
  function message() {
    void openDirect
      .mutateAsync({ accountId: address })
      .catch(() =>
        Alert.alert("Couldn't Open Conversation", "Try again in a moment."),
      );
    router.push({
      params: {
        account,
        conversationId: directConversationId(account, address.toLowerCase()),
        title: name,
      },
      pathname: "/conversation/[conversationId]",
    });
  }

  return (
    <FieldGroup.Section>
      <Button
        variant="filled"
        modifiers={[...prominentButton, ...plainRow]}
        onPress={message}
      >
        <Text
          modifiers={fillWidth}
          textStyle={{ fontSize: 17, fontWeight: "600", textAlign: "center" }}
        >
          Message
        </Text>
      </Button>
    </FieldGroup.Section>
  );
}

function Profile({ address }: { address: string }) {
  const router = useRouter();
  const { address: account } = useAccount();
  const profile = useProfile(address);
  // Shown once the profile has loaded, fading in rather than popping.
  if (profile.isLoading) return null;
  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1 }}>
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup>
          <ProfileCard
            name={profile.displayName}
            subtitle={address}
            avatarUrl={profile.avatarUrl}
            onPressAffiliated={
              profile.affiliated
                ? () =>
                    router.push({
                      params: { account, address },
                      pathname: "/affiliated",
                    })
                : undefined
            }
          />
          {address !== account && (
            <MessageButton address={address} name={profile.displayName} />
          )}
        </FieldGroup>
      </NativeHost>
    </Animated.View>
  );
}

/** A person's profile, seen as the account in the `account` param. */
export default function ProfileScreen() {
  const { account, address } = useLocalSearchParams<{
    /** The signed-in account looking at the profile. */
    account?: string;
    address: string;
  }>();
  return (
    <AccountScope address={account}>
      <Profile address={address} />
    </AccountScope>
  );
}
