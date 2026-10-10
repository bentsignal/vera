import type { Href } from "expo-router";
import { DevSettings } from "react-native";
import { router } from "expo-router";

import { env } from "~/env";
import { storedAccounts } from "~/features/session/account-store";
import { devSignInPath } from "./dev-sign-in-path";

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
        const target = devSignInPath(path, storedAccounts().length > 0);
        if (isAppPath(target)) router.push(target);
      },
      reload() {
        DevSettings.reload();
      },
    },
  });
}
