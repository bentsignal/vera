import { useState } from "react";
import { TextInput, View } from "react-native";
import { withUniwind } from "uniwind";

import { ProminentButton } from "~/components/prominent-button";
import { useAuthFlow } from "~/features/auth/auth-flow";
import { usePendingSignIn } from "~/features/session/pending-sign-in";
import { devSignIn } from "./dev-tools";

const StyledTextInput = withUniwind(TextInput);

/** Dev PDS only: sign in as any username, for simulators. */
export function DevSignIn() {
  const pending = usePendingSignIn();
  const { attempt } = useAuthFlow();
  const [username, setUsername] = useState("");

  async function submit() {
    await attempt("Dev Sign In", () => devSignIn(pending, username));
  }

  return (
    <View className="gap-2">
      <StyledTextInput
        accessibilityLabel="Dev username"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="dev username"
        onChangeText={setUsername}
        onSubmitEditing={() => void submit()}
        returnKeyType="go"
        className="border-separator text-body text-foreground rounded-xl border px-4 py-3"
        placeholderTextColorClassName="accent-muted"
      />
      <ProminentButton
        label="Dev Sign In"
        variant="text"
        disabled={username.trim().length < 2}
        onPress={() => void submit()}
      />
    </View>
  );
}
