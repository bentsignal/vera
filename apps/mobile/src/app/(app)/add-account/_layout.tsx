import { Stack } from "expo-router";

import { useFormScreenOptions } from "~/components/form-screen-options";

export const unstable_settings = { anchor: "index" };

/** Settings' "Add Account": the signed-out screens, in a modal. */
export default function AddAccountLayout() {
  const formScreen = useFormScreenOptions();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen
        name="index"
        options={{ headerTransparent: true, title: "" }}
      />
      <Stack.Screen
        name="create-account"
        options={{ ...formScreen, title: "Create Account" }}
      />
      <Stack.Screen name="dev-sign-in" options={{ headerShown: false }} />
    </Stack>
  );
}
