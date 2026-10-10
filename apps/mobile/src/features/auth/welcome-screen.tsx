import { Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import Close from "@expo/material-symbols/close.xml";
import { withUniwind } from "uniwind";

import { ProminentButton } from "~/components/prominent-button";
import appIcon from "../../../assets/images/icon.png";
import { useAuthFlow } from "./auth-flow";

const StyledSafeAreaView = withUniwind(SafeAreaView);
const StyledImage = withUniwind(Image);

export function WelcomeScreen() {
  const router = useRouter();
  const { adding, createAccountHref, signInHref } = useAuthFlow();
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
          onPress={() => router.push(createAccountHref)}
        />
        <ProminentButton
          label="Sign In"
          variant="secondary"
          onPress={() => router.push(signInHref)}
        />
      </View>
    </StyledSafeAreaView>
  );
}
