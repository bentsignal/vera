import type { Href } from "expo-router";
import { DevSettings } from "react-native";
import { router } from "expo-router";

import { env } from "~/env";

function isAppPath(path: string): path is Href & string {
  return path.startsWith("/");
}

/**
 * Debug builds on a dev PDS only: lets `scripts/sim.sh open` move around
 * the app over Metro's debugger connection. iOS asks "Open in Vera?" before
 * every `simctl openurl`, which scripts cannot answer.
 */
export function installDevAutomation() {
  if (!__DEV__ || !env.devTools) return;
  Object.assign(globalThis, {
    veraDev: {
      open(path: string) {
        if (!path.startsWith("/")) throw new Error(`Not an app path: ${path}`);
        if (isAppPath(path)) router.push(path);
      },
      reload() {
        DevSettings.reload();
      },
    },
  });
}
