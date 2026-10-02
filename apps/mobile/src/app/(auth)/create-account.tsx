import { useState } from "react";
import { Alert, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FieldGroup, Row, Text, TextInput } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { ProminentButton } from "~/components/prominent-button";
import { env } from "~/env";
import { isValidUsername, normalizeUsername } from "~/features/auth/username";
import { createAccount } from "~/features/session/passkeys";
import { useSession } from "~/features/session/session-provider";
import { nativeColors } from "~/lib/colors";

export default function CreateAccountScreen() {
  const insets = useSafeAreaInsets();
  const { authClient } = useSession();
  const [inviteCode, setInviteCode] = useState("");
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const canSubmit =
    !pending &&
    inviteCode.trim().length > 0 &&
    isValidUsername(normalizeUsername(username));

  async function submit() {
    setPending(true);
    const error = await createAccount(authClient, {
      inviteCode: inviteCode.trim(),
      username: normalizeUsername(username),
    });
    setPending(false);
    if (error !== null) Alert.alert("Couldn't Create Account", error);
  }

  return (
    <View className="bg-background-grouped flex-1">
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup>
          <FieldGroup.Section title="Invite Code">
            <TextInput
              placeholder="Enter your invite code"
              autoCapitalize="characters"
              autoCorrect={false}
              onChangeText={setInviteCode}
            />
            <FieldGroup.SectionFooter>
              <Text>Vera is invite-only for now. Ask a friend for a code.</Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
          <FieldGroup.Section title="Address">
            <Row alignment="center" spacing={2}>
              <TextInput
                placeholder="username"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username-new"
                onChangeText={setUsername}
              />
              <Text
                textStyle={{ color: nativeColors.secondaryLabel }}
              >{`@${env.veraDomain}`}</Text>
            </Row>
            <FieldGroup.SectionFooter>
              <Text>
                Your address is how people find you. It can't be changed later.
              </Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
        </FieldGroup>
      </NativeHost>
      <KeyboardStickyView offset={{ opened: insets.bottom }}>
        <View
          className="gap-2 px-6 pt-3"
          style={{ paddingBottom: insets.bottom + 8 }}
        >
          <ProminentButton
            label="Create Passkey"
            disabled={!canSubmit}
            onPress={() => void submit()}
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}
