import { Stack } from "expo-router";

export const unstable_settings = { anchor: "index" };

/** Settings' "Add Account": the signed-out screens, in a modal. */
export default function AddAccountLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen
        name="index"
        options={{ headerTransparent: true, title: "" }}
      />
      <Stack.Screen
        name="create-account"
        options={{ title: "Create Account" }}
      />
      <Stack.Screen name="sign-in" options={{ title: "Sign In" }} />
    </Stack>
  );
}
