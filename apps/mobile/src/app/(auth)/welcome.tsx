import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { withUniwind } from "uniwind";

import { ProminentButton } from "~/components/prominent-button";
import appIcon from "../../../assets/images/icon.png";

const StyledSafeAreaView = withUniwind(SafeAreaView);
const StyledImage = withUniwind(Image);

export default function WelcomeScreen() {
  const router = useRouter();
  return (
    <StyledSafeAreaView className="bg-background flex-1 px-6 pb-2">
      <View className="flex-1 items-center justify-center gap-4">
        <StyledImage source={appIcon} className="size-24 rounded-[22px]" />
        <Text className="text-large-title text-foreground font-bold">Vera</Text>
        <Text className="text-body text-muted text-center">
          Private messaging for you and your friends, on servers you can trust.
        </Text>
      </View>
      <View className="gap-3">
        <ProminentButton
          label="Create Account"
          onPress={() => router.push("/create-account")}
        />
        <ProminentButton
          label="Sign In"
          variant="text"
          onPress={() => router.push("/sign-in")}
        />
      </View>
    </StyledSafeAreaView>
  );
}
