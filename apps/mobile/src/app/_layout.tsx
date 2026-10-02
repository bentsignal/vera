import "~/global.css";

import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import { useCSSVariable } from "uniwind";

import { applyStoredPreferences } from "~/features/preferences/store";
import { SessionProvider } from "~/features/session/session-provider";

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
  const { isAuthenticated, isLoading } = useConvexAuth();
  // eslint-disable-next-line no-restricted-syntax -- The native splash screen stays up until the session is known.
  useEffect(() => {
    if (!isLoading) void SplashScreen.hideAsync();
  }, [isLoading]);
  if (isLoading) return null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
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
  const [queryClient] = useState(() => new QueryClient());
  return (
    <ThemeProvider value={useNavigationTheme()}>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider fallback={null}>
            <Navigator />
          </SessionProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </ThemeProvider>
  );
}
