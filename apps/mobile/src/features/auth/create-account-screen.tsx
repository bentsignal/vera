import { useState } from "react";
import { View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FieldGroup } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { ProminentButton } from "~/components/prominent-button";
import { createAccount } from "~/features/session/passkeys";
import { usePendingSignIn } from "~/features/session/pending-sign-in";
import { useAuthFlow } from "./auth-flow";
import { newAccountSections } from "./new-account-sections";
import { isValidUsername, normalizeUsername } from "./username";

export function CreateAccountScreen() {
  const insets = useSafeAreaInsets();
  const pendingSignIn = usePendingSignIn();
  const { attempt } = useAuthFlow();
  const [inviteCode, setInviteCode] = useState("");
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const canSubmit =
    !pending &&
    inviteCode.trim().length > 0 &&
    isValidUsername(normalizeUsername(username));

  async function submit() {
    setPending(true);
    await attempt("Couldn't Create Account", () =>
      createAccount(pendingSignIn, {
        inviteCode: inviteCode.trim(),
        username: normalizeUsername(username),
      }),
    );
    setPending(false);
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
