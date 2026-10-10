import { Stack } from "expo-router";

import { useFormScreenOptions } from "~/components/form-screen-options";

export const unstable_settings = { anchor: "welcome" };

export default function AuthLayout() {
  const formScreen = useFormScreenOptions();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen
        name="create-account"
        options={{ ...formScreen, title: "Create Account" }}
      />
      <Stack.Screen name="dev-sign-in" options={{ headerShown: false }} />
    </Stack>
  );
}
