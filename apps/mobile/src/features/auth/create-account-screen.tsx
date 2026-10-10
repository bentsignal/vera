import type { TextInputRef } from "@expo/ui";
import { useRef, useState } from "react";
import { View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FieldGroup } from "@expo/ui";

import { useFormBackground } from "~/components/form-background";
import { NativeHost } from "~/components/native-host";
import { ProminentButton } from "~/components/prominent-button";
import { createAccount } from "~/features/session/passkeys";
import { usePendingSignIn } from "~/features/session/pending-sign-in";
import { useAuthFlow } from "./auth-flow";
import { INVITE_CODE_LENGTH } from "./invite-code";
import { newAccountSections } from "./new-account-sections";
import { isValidUsername, normalizeUsername } from "./username";

export function CreateAccountScreen() {
  const insets = useSafeAreaInsets();
  const background = useFormBackground();
  const pendingSignIn = usePendingSignIn();
  const { attempt, pending } = useAuthFlow();
  const [inviteCode, setInviteCode] = useState("");
  const [username, setUsername] = useState("");
  const usernameRef = useRef<TextInputRef>(null);
  const canSubmit =
    inviteCode.length === INVITE_CODE_LENGTH &&
    isValidUsername(normalizeUsername(username));

  return (
    // The form's color behind the button too, so the screen is one color
    // (see `useFormScreenOptions` for the header).
    <View className="flex-1" style={{ backgroundColor: background }}>
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup>
          {newAccountSections({
            inviteCode,
            onChangeInviteCode: setInviteCode,
            onChangeUsername: setUsername,
            usernameRef,
          })}
        </FieldGroup>
      </NativeHost>
      <KeyboardStickyView offset={{ opened: insets.bottom }}>
        <View
          className="px-6 pt-3"
          style={{ paddingBottom: insets.bottom + 8 }}
        >
          <ProminentButton
            label="Continue"
            disabled={!canSubmit}
            loading={pending}
            onPress={() =>
              void attempt("Couldn't Create Account", () =>
                createAccount(pendingSignIn, {
                  inviteCode,
                  username: normalizeUsername(username),
                }),
              )
            }
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}
