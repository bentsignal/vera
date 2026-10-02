import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

import { ProminentButton } from "~/components/prominent-button";
import { SymbolIcon } from "~/components/symbol-icon";
import { env } from "~/env";
import { DevSignIn } from "~/features/dev/dev-sign-in";
import { signIn } from "~/features/session/passkeys";
import { useSession } from "~/features/session/session-provider";

const StyledSafeAreaView = withUniwind(SafeAreaView);

export default function SignInScreen() {
  const { authClient } = useSession();
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    const error = await signIn(authClient);
    setPending(false);
    if (error !== null) Alert.alert("Sign In Failed", error);
  }

  return (
    <StyledSafeAreaView
      edges={["bottom"]}
      className="bg-background flex-1 px-6 pb-2"
    >
      <View className="flex-1 items-center justify-center gap-4">
        <SymbolIcon
          name={{ ios: "person.badge.key.fill", android: "passkey" }}
          size={64}
          tintColorClassName="accent-accent"
        />
        <Text className="text-title text-foreground font-bold">
          Welcome back
        </Text>
        <Text className="text-body text-muted text-center">
          Use the passkey saved on this device or in your password manager. Vera
          never asks for a password.
        </Text>
      </View>
      {env.devTools && <DevSignIn />}
      <ProminentButton
        label="Sign In with Passkey"
        disabled={pending}
        onPress={() => void submit()}
      />
    </StyledSafeAreaView>
  );
}
