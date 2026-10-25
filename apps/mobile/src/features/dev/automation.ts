import type { Href } from "expo-router";
import { DevSettings } from "react-native";
import { router } from "expo-router";

import type { Preferences } from "~/features/preferences/store";
import { env } from "~/env";
import { inboxQuery } from "~/features/messaging/inbox";
import { cachedSelected } from "~/features/messaging/results";
import {
  nativeListInstalled,
  nativeListOn,
  setNativeList,
} from "~/features/native-list/switch";
import { setPreference } from "~/features/preferences/store";
import { queryClient } from "~/features/session/account-session";
import { storedAccounts } from "~/features/session/account-store";
import { devConversation } from "./dev-conversation";
import { devList, startStalls, stopStalls } from "./dev-list";
import { devSignInPath } from "./dev-sign-in-path";
import { frameReport, startFrames, stopFrames } from "./frames";
import { photoTiming } from "./photo-timing";
import { sendTiming } from "./send-timing";

function isAppPath(path: string): path is Href & string {
  return path.startsWith("/");
}

/**
 * Debug builds on a dev PDS only: lets `scripts/sim.sh open` move around
 * the app over Metro's debugger connection. iOS asks "Open in Vera?" before
 * every `simctl openurl`, which scripts cannot answer.
 */
export function installDevAutomation() {
  if ((!__DEV__ && !env.profileBundle) || !env.devTools) return;
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
      /** Sets a preference, such as `groupLayout`, without the settings. */
      preference<Key extends keyof Preferences>(
        key: Key,
        value: Preferences[Key],
      ) {
        setPreference(key, value);
      },
      /** The open conversation, to react and send without tapping. */
      conversation: devConversation,
      /** The open conversation's list, to fling it at a constant speed. */
      list: devList,
      /** The JavaScript thread's stalls: `start()`, then `stop()`. */
      stalls: { start: startStalls, stop: stopStalls },
      /** `scripts/sim.sh frames start` and `stop`: see frames.ts. */
      frames: { report: frameReport, start: startFrames, stop: stopFrames },
      /** Opening a photo from the list, timed: see photo-timing.ts. */
      photoTiming,
      /** Committed composer geometry versus later height reports. */
      sendTiming,
      /**
       * Turns the native message list on or off, and says which list
       * conversations show: "native", or "rn" (off, or not in this binary).
       */
      nativeList(on?: boolean) {
        if (on !== undefined) setNativeList(on);
        return nativeListOn() && nativeListInstalled ? "native" : "rn";
      },
      /**
       * The newest group the signed-in account is in, once the inbox has
       * loaded, for scripts that need one (scripts/motion).
       */
      firstGroup() {
        const account = storedAccounts()[0];
        if (account === undefined) return null;
        const inbox = cachedSelected(queryClient, inboxQuery(account.address));
        return (
          inbox?.find((conversation) => conversation.kind === "group")
            ?.conversationId ?? null
        );
      },
    },
  });
}
