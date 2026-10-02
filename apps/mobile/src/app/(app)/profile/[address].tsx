import { Alert } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { pdsMutation } from "@decentralized-convex/tanstack-query";
import { Button, FieldGroup, Text } from "@expo/ui";
import { pds } from "@vera/backend/pds";

import { NativeHost } from "~/components/native-host";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { useProfile } from "~/features/messaging/profiles";
import { ProfileCard } from "~/features/profile/profile-card";
import { fillWidth, plainRow, prominentButton } from "~/lib/ui-modifiers";

/** Opens (or starts) the direct conversation with `address`. */
function MessageButton({ address, name }: { address: string; name: string }) {
  const router = useRouter();
  const { address: account } = useAccount();
  const openDirect = useMutation(
    pdsMutation({ mutation: pds.messages.openDirect, session: account }),
  );

  async function message() {
    const opened = await openDirect
      .mutateAsync({ accountId: address })
      .catch(() => null);
    if (opened === null) {
      Alert.alert("Couldn't Open Conversation", "Try again in a moment.");
      return;
    }
    router.push({
      params: { account, conversationId: opened.conversationId, title: name },
      pathname: "/conversation/[conversationId]",
    });
  }

  return (
    <FieldGroup.Section>
      <Button
        variant="filled"
        disabled={openDirect.isPending}
        modifiers={[...prominentButton, ...plainRow]}
        onPress={() => void message()}
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
