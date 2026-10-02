import { Alert } from "react-native";
import Constants from "expo-constants";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pdsMutation } from "@decentralized-convex/tanstack-query";
import { Button, FieldGroup, Row, Spacer, Text } from "@expo/ui";
import { pds } from "@vera/backend/pds";

import { useAccount } from "~/features/messaging/account";
import { getPushToken } from "~/features/notifications/push";
import { useSession } from "~/features/session/session-provider";
import { nativeColors } from "~/lib/colors";
import { destructive } from "~/lib/ui-modifiers";

export function AccountSection() {
  const { home } = useSession();
  const { signOut } = useAccount();
  const queryClient = useQueryClient();
  const unregister = useMutation(
    pdsMutation({ mutation: pds.messages.unregisterPushToken }),
  );

  async function signOutAndForget() {
    const token = await getPushToken().catch(() => null);
    if (token !== null) {
      await unregister.mutateAsync({ token }).catch(() => null);
    }
    await signOut();
    queryClient.removeQueries({ queryKey: ["decentralized-convex"] });
    queryClient.removeQueries({ queryKey: ["vera", "session"] });
  }

  function confirmSignOut() {
    Alert.alert("Sign Out?", "You can sign back in with your passkey.", [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => void signOutAndForget(),
        style: "destructive",
        text: "Sign Out",
      },
    ]);
  }

  return (
    <FieldGroup.Section title="Account">
      <Row alignment="center">
        <Text>Home Server</Text>
        <Spacer />
        <Text textStyle={{ color: nativeColors.secondaryLabel }}>
          {home.domain}
        </Text>
      </Row>
      <Button
        label="Sign Out"
        variant="text"
        modifiers={destructive}
        onPress={confirmSignOut}
      />
      <FieldGroup.SectionFooter>
        <Text>{`Vera ${Constants.expoConfig?.version ?? ""}`}</Text>
      </FieldGroup.SectionFooter>
    </FieldGroup.Section>
  );
}
