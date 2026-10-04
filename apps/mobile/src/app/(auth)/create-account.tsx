import { useState } from "react";
import { Alert, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FieldGroup } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { ProminentButton } from "~/components/prominent-button";
import { newAccountSections } from "~/features/auth/new-account-sections";
import { isValidUsername, normalizeUsername } from "~/features/auth/username";
import { createAccount } from "~/features/session/passkeys";
import { usePendingSignIn } from "~/features/session/pending-sign-in";

export default function CreateAccountScreen() {
  const insets = useSafeAreaInsets();
  const pendingSignIn = usePendingSignIn();
  const [inviteCode, setInviteCode] = useState("");
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const canSubmit =
    !pending &&
    inviteCode.trim().length > 0 &&
    isValidUsername(normalizeUsername(username));

  async function submit() {
    setPending(true);
    const error = await createAccount(pendingSignIn, {
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
          {newAccountSections({
            onChangeInviteCode: setInviteCode,
            onChangeUsername: setUsername,
          })}
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
