import type { TextInputRef } from "@expo/ui";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Button, FieldGroup, Text, TextInput } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { env } from "~/env";
import { INVITE_CODE_LENGTH } from "~/features/auth/invite-code";
import { newAccountSections } from "~/features/auth/new-account-sections";
import { isValidUsername, normalizeUsername } from "~/features/auth/username";
import { devSignIn } from "~/features/dev/dev-tools";
import { storedAccounts } from "~/features/session/account-store";
import { createAccount, signIn } from "~/features/session/passkeys";
import { usePendingSignIn } from "~/features/session/pending-sign-in";
import { linkButton } from "~/lib/ui-modifiers";

/** Signs in to, or creates, one more account alongside the others. */
export default function AddAccountScreen() {
  const router = useRouter();
  const pendingSignIn = usePendingSignIn();
  const [inviteCode, setInviteCode] = useState("");
  const [username, setUsername] = useState("");
  const [devUsername, setDevUsername] = useState("");
  const [pending, setPending] = useState(false);
  const usernameRef = useRef<TextInputRef>(null);

  async function run(attempt: () => Promise<string | null>, title: string) {
    const before = storedAccounts().length;
    setPending(true);
    const error = await attempt();
    setPending(false);
    if (error !== null) Alert.alert(title, error);
    else if (storedAccounts().length > before) router.back();
  }

  return (
    <NativeHost style={{ flex: 1 }}>
      <FieldGroup>
        <FieldGroup.Section title="Existing Account">
          <Button
            label="Sign In with Passkey"
            variant="text"
            modifiers={linkButton}
            disabled={pending}
            onPress={() =>
              void run(() => signIn(pendingSignIn), "Sign In Failed")
            }
          />
          <FieldGroup.SectionFooter>
            <Text>Choose the passkey for the account you want to add.</Text>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>
        {env.devTools && (
          <FieldGroup.Section title="Dev Sign In">
            <TextInput
              placeholder="dev username"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setDevUsername}
            />
            <Button
              label="Dev Sign In"
              variant="text"
              modifiers={linkButton}
              disabled={pending || devUsername.trim().length < 2}
              onPress={() =>
                void run(
                  () => devSignIn(pendingSignIn, devUsername),
                  "Dev Sign In",
                )
              }
            />
          </FieldGroup.Section>
        )}
        {newAccountSections({
          inviteCode,
          onChangeInviteCode: setInviteCode,
          onChangeUsername: setUsername,
          usernameRef,
        })}
        <FieldGroup.Section>
          <Button
            label="Create Account"
            variant="text"
            modifiers={linkButton}
            disabled={
              pending ||
              inviteCode.length !== INVITE_CODE_LENGTH ||
              !isValidUsername(normalizeUsername(username))
            }
            onPress={() =>
              void run(
                () =>
                  createAccount(pendingSignIn, {
                    inviteCode,
                    username: normalizeUsername(username),
                  }),
                "Couldn't Create Account",
              )
            }
          />
        </FieldGroup.Section>
      </FieldGroup>
    </NativeHost>
  );
}
