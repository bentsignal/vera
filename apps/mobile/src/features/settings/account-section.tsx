import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Button, FieldGroup, Row, Spacer, Text } from "@expo/ui";

import { useAccount } from "~/features/messaging/account";
import { nativeColors } from "~/lib/colors";
import { destructive, fillRow } from "~/lib/ui-modifiers";
import { signOutAccount } from "./sign-out";

/** The account's home server and sign-out. */
export function AccountSection() {
  const router = useRouter();
  const { address, session } = useAccount();

  function confirmSignOut() {
    Alert.alert(
      `Sign Out of ${address}?`,
      "You can sign back in with your passkey.",
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => {
            signOutAccount(session);
            router.back();
          },
          style: "destructive",
          text: "Sign Out",
        },
      ],
    );
  }

  return (
    <FieldGroup.Section>
      <Row alignment="center" modifiers={fillRow}>
        <Text>Home Server</Text>
        <Spacer flexible />
        <Text textStyle={{ color: nativeColors.secondaryLabel }}>
          {session.home.domain}
        </Text>
      </Row>
      <Button
        label="Sign Out"
        variant="text"
        modifiers={destructive}
        onPress={confirmSignOut}
      />
    </FieldGroup.Section>
  );
}
