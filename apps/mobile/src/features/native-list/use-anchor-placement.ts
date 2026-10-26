import { useRef, useState } from "react";
import { Alert } from "react-native";
import {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { MessageListViewMethods } from "./native";
import { createAnchorPlacement } from "./anchor-placement";

/** The existing native command runs after placement, before the cover fades. */
export function useAnchorPlacement(
  {
    anchorId: anchor,
    messages,
  }: {
    readonly anchorId?: string;
    readonly messages: readonly { readonly id: string }[];
  },
  hasNewer: boolean,
) {
  const view = useRef<MessageListViewMethods>(null);
  const [placement] = useState(createAnchorPlacement<MessageListViewMethods>);
  const near = useSharedValue(anchor === undefined);
  const loaded = useSharedValue(0);
  return {
    view,
    cover: useAnimatedStyle(() => ({ opacity: 1 - loaded.value })),
    showJump: useDerivedValue(() => hasNewer || !near.value),
    onNearLatest: (value: boolean) => near.set(value),
    attach: (next: MessageListViewMethods | null) => {
      view.current = next;
      placement.attach(next);
    },
    onReady: () =>
      placement.ready({
        anchor,
        present: messages.some((message) => message.id === anchor),
        show: () => loaded.set(withTiming(1, { duration: 220 })),
        failed: () =>
          Alert.alert("Couldn't Open Message", "Please try opening it again."),
      }),
  };
}
