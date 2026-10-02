import { Stack } from "expo-router";

export const unstable_settings = { anchor: "welcome" };

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen
        name="create-account"
        options={{ title: "Create Account" }}
      />
      <Stack.Screen name="sign-in" options={{ title: "Sign In" }} />
      <Stack.Screen name="dev-sign-in" options={{ headerShown: false }} />
    </Stack>
  );
}
