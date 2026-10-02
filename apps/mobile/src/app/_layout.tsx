import "~/global.css";

import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { QueryClientProvider } from "@tanstack/react-query";
import { useCSSVariable } from "uniwind";

import { applyStoredPreferences } from "~/features/preferences/store";
import { queryClient } from "~/features/session/account-session";
import {
  SessionProvider,
  useSession,
} from "~/features/session/session-provider";

void SplashScreen.preventAutoHideAsync();
applyStoredPreferences();

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

function Navigator() {
  const isAuthenticated = useSession().accounts.length > 0;
  // eslint-disable-next-line no-restricted-syntax -- The native splash screen stays up until the accounts' home servers are known.
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  return (
    <Stack
      // Signing out of the last account replaces the whole app tree, so no
      // screen renders without an account first.
      key={isAuthenticated ? "app" : "auth"}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={useNavigationTheme()}>
        <KeyboardProvider>
          <QueryClientProvider client={queryClient}>
            <SessionProvider fallback={null}>
              <Navigator />
            </SessionProvider>
          </QueryClientProvider>
        </KeyboardProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
