import type { RefObject } from "react";
import { useEffect } from "react";
import { useIsFocused } from "expo-router";

import type { MessageListViewMethods } from "./native";
import { env } from "~/env";
import { registerDevList } from "~/features/dev/dev-list";
import { nativeSupport } from "./native";

/**
 * Hands the native list to benchmark scripts (`veraDev.list()`): its
 * constant-speed fling is the binary's `benchFling`, driven on the display
 * link, as the React Native list's is (`useDevFling`).
 */
export function useDevNativeFling(
  view: RefObject<MessageListViewMethods | null>,
) {
  const focused = useIsFocused();
  // eslint-disable-next-line no-restricted-syntax -- Hands the list to benchmark scripts, which run outside React; dev tools only.
  useEffect(() => {
    if (!env.devTools || !focused) return;
    const flings = nativeSupport?.features?.includes("benchFling") === true;
    return registerDevList({
      fling: async (speed, ms) => {
        const list = view.current;
        if (!flings || list === null || !("benchFling" in list)) return null;
        return (await list.benchFling?.(speed, ms)) ?? null;
      },
      kind: "native",
    });
  }, [focused, view]);
}
