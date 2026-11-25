import type { ReactNode, RefObject } from "react";
import type { SharedValue } from "react-native-reanimated";
import { Platform, useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
} from "react-native-reanimated";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { useCSSVariable } from "uniwind";

import { ScreenListInsets } from "~/components/screen-list-insets";
import { ANDROID_TAB_BAR } from "~/components/tab-bar";

export type PagerRef = RefObject<Animated.ScrollView | null>;

/**
 * Hands the screen's insets, measured outside the pager, to its lists:
 * they scroll under the tab bar, and their last rows end above it. On
 * Android the tab bar is drawn over the bottom of the screen, above the
 * system navigation's inset.
 */
function PagerInsets({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScreenListInsets
      value={
        Platform.OS === "ios"
          ? insets
          : {
              bottom: insets.bottom + ANDROID_TAB_BAR,
              left: 0,
              right: 0,
              top: 0,
            }
      }
    >
      {children}
    </ScreenListInsets>
  );
}

/** One of `HomePager`'s pages, as wide as the screen. */
export function PagerPage({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  return <View style={{ width }}>{children}</View>;
}

/**
 * Home's `PagerPage`s side by side, swiped between like X's home
 * timelines. It keeps `position` on the current page (fractional
 * mid-swipe) and calls `onPageChange` once a swipe passes the halfway
 * point, so the header and its buttons switch while the finger is down.
 */
export function HomePager({
  pagerRef,
  position,
  onPageChange,
  children,
}: {
  pagerRef: PagerRef;
  position: SharedValue<number>;
  onPageChange: (index: number) => void;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  // The lists' background, so a page that's still loading isn't gray.
  const background = useCSSVariable("--color-background");
  const onScroll = useAnimatedScrollHandler((event) => {
    if (width > 0) position.set(event.contentOffset.x / width);
  });
  useAnimatedReaction(
    () => Math.round(position.get()),
    (now, before) => {
      if (before !== null && now !== before) scheduleOnRN(onPageChange, now);
    },
  );
  return (
    // Its own provider measures this screen (under the header, over the
    // tab bar), not the window.
    <SafeAreaProvider style={{ flex: 1 }}>
      <PagerInsets>
        <Animated.ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          // Its lists take the insets instead (`PagerInsets`). The Home tab
          // keeps the tab bar from making this "automatic" (see the tabs
          // layout): with the tab bar's inset it would scroll up and down.
          contentInsetAdjustmentBehavior="never"
          bounces={false}
          overScrollMode="never"
          directionalLockEnabled
          alwaysBounceVertical={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          style={{
            backgroundColor:
              typeof background === "string" ? background : undefined,
            flex: 1,
          }}
        >
          {children}
        </Animated.ScrollView>
      </PagerInsets>
    </SafeAreaProvider>
  );
}
