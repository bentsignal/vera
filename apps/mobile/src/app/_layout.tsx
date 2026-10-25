import "~/global.css";

import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { QueryClientProvider } from "@tanstack/react-query";
import { useCSSVariable } from "uniwind";

import { installDevAutomation } from "~/features/dev/automation";
import { applyStoredPreferences } from "~/features/preferences/store";
import { installSaving } from "~/features/saved/saving";
import { queryClient } from "~/features/session/account-session";
import {
  SessionProvider,
  useSession,
} from "~/features/session/session-provider";
import {
  installAppUpdates,
  noteTouch,
  UpdateNavigation,
} from "~/features/updates/app-updates";
import { StoreUpdateCover } from "~/features/updates/store-update-cover";
import { UpdateCover } from "~/features/updates/update-cover";
import { WatchBreakingVersion } from "~/features/updates/watch-breaking-version";
import { WatchOutdatedRuntimes } from "~/features/updates/watch-outdated-runtimes";

void SplashScreen.preventAutoHideAsync();
// The splash is a plain background, so the app fades in over it.
SplashScreen.setOptions({ duration: 250, fade: true });
applyStoredPreferences();
installDevAutomation();
installAppUpdates();
installSaving();

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
    <GestureHandlerRootView style={{ flex: 1 }} onTouchStart={noteTouch}>
      <ThemeProvider value={useNavigationTheme()}>
        <KeyboardProvider>
          <QueryClientProvider client={queryClient}>
            <SessionProvider fallback={null}>
              <UpdateNavigation />
              <WatchBreakingVersion />
              <WatchOutdatedRuntimes />
              <Navigator />
            </SessionProvider>
            <UpdateCover />
            <StoreUpdateCover />
          </QueryClientProvider>
        </KeyboardProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
