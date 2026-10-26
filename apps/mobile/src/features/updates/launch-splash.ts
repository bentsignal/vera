import * as SplashScreen from "expo-splash-screen";

// The native splash hides once the first real screen mounts, unless the
// launch's update check is still holding it (see `app-updates.ts`).

let release: (() => void) | undefined;
const released = new Promise<void>((resolve) => {
  release = resolve;
});

/** Hides the splash, once the launch's update check lets it. */
export function hideSplashWhenReady() {
  void released.then(() => SplashScreen.hideAsync());
}

/** Lets the splash hide. Calling it again does nothing. */
export function releaseSplash() {
  release?.();
}
