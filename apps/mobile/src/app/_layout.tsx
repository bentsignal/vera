import "~/global.css";

import { useColorScheme } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useCSSVariable } from "uniwind";

import { useIsSignedIn } from "~/mock/session";

function useNavigationTheme() {
  const scheme = useColorScheme();
  const accent = useCSSVariable("--color-accent");
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: typeof accent === "string" ? accent : base.colors.primary,
    },
  };
}

export default function RootLayout() {
  const isSignedIn = useIsSignedIn();
  return (
    <ThemeProvider value={useNavigationTheme()}>
      <KeyboardProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={isSignedIn}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={!isSignedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      </KeyboardProvider>
    </ThemeProvider>
  );
}
