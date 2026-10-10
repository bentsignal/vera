import { Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import Close from "@expo/material-symbols/close.xml";
import { withUniwind } from "uniwind";

import { ProminentButton } from "~/components/prominent-button";
import { signIn } from "~/features/session/passkeys";
import { usePendingSignIn } from "~/features/session/pending-sign-in";
import appIcon from "../../../assets/images/icon.png";
import { useAuthFlow } from "./auth-flow";

const StyledSafeAreaView = withUniwind(SafeAreaView);
const StyledImage = withUniwind(Image);

export function WelcomeScreen() {
  const router = useRouter();
  const pendingSignIn = usePendingSignIn();
  const { adding, attempt, createAccountHref, pending } = useAuthFlow();
  return (
    // In Add Account's modal, the sheet color, so it reads as a sheet.
    <StyledSafeAreaView
      className={`flex-1 px-6 pb-6 ${adding ? "bg-background-elevated" : "bg-background"}`}
    >
      {adding && (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            icon={Platform.OS === "ios" ? "xmark" : Close}
            accessibilityLabel="Close"
            onPress={() => router.back()}
          />
        </Stack.Toolbar>
      )}
      <View className="flex-1 items-center justify-center gap-4">
        <StyledImage source={appIcon} className="size-24 rounded-[22px]" />
        <Text className="text-large-title text-foreground font-bold">Vera</Text>
        <Text className="text-body text-muted text-center">
          Private messaging for you and your friends, on servers you can trust.
        </Text>
      </View>
      <View className="gap-4">
        <ProminentButton
          label="Create Account"
          onPress={() => {
            if (!pending) router.push(createAccountHref);
          }}
        />
        {/* One tap: the system offers the Vera passkeys saved on this device. */}
        <ProminentButton
          label="Sign In"
          variant="secondary"
          loading={pending}
          onPress={() =>
            void attempt("Couldn't Sign In", () => signIn(pendingSignIn))
          }
        />
      </View>
    </StyledSafeAreaView>
  );
}
