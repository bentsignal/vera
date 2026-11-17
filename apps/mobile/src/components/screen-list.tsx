import type {
  LegendListProps,
  LegendListRef,
} from "@legendapp/list/react-native";
import type { Ref } from "react";
import { use } from "react";
import { ScrollView, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { LegendList } from "@legendapp/list/react-native";
import { useCSSVariable } from "uniwind";

import { Pending, usePending } from "./pending";
import { ScreenListInsets } from "./screen-list-insets";
import { useSteadyData } from "./steady-data";

/** Room above the rows for the screen's pill, while it shows. */
const OFFLINE_ROOM = 44;

/** How far past the screen, in points, rows are drawn ahead of time. */
const DRAW_DISTANCE = 1000;

/**
 * Room above the rows for the screen's pill while it shows. A header, not
 * padding, which Legend List doesn't measure again.
 */
function PillRoom({ offline, pill }: { offline: boolean; pill?: boolean }) {
  return <View style={{ height: (pill ?? offline) ? OFFLINE_ROOM : 0 }} />;
}

/**
 * `Pending` where a `ScreenList`'s rows would start: below the header, as
 * the list would be, large title and all.
 */
function PendingRows({ phase }: { phase: ReturnType<typeof usePending> }) {
  const insets = use(ScreenListInsets);
  return (
    <ScrollView
      className="bg-background"
      scrollEnabled={false}
      contentInsetAdjustmentBehavior={insets === null ? "automatic" : "never"}
    >
      <View style={{ paddingTop: insets?.top }}>
        <Pending phase={phase} top />
      </View>
    </ScrollView>
  );
}

/**
 * A full-screen Legend List under a native header, so large titles collapse
 * as it scrolls and its background follows the theme. Until `ready` it
 * shows what `usePending` says (nothing, unless loading is slow) where
 * its rows would start, then fades in: loading content never pops in.
 */
export function ScreenList<Item>({
  ready = true,
  offline = false,
  pill,
  ref,
  steady = false,
  ...props
}: LegendListProps<Item> & {
  ready?: boolean;
  /**
   * The screen's `OfflinePill` is up: the rows make room for it, and the
   * spinner doesn't say it too.
   */
  offline?: boolean;
  /**
   * A pill is up over the rows (`OfflinePill`, or Home's
   * `UnreachablePill`): the rows make room for it. `offline` by default.
   */
  pill?: boolean;
  ref?: Ref<LegendListRef>;
  /** Rows don't move under the finger as data changes (`useSteadyData`). */
  steady?: boolean;
}) {
  const background = useCSSVariable("--color-background");
  const insets = use(ScreenListInsets);
  const held = useSteadyData(props.data);
  const pending = usePending(!ready, offline);
  const inset =
    insets === null ? undefined : { bottom: insets.bottom, top: insets.top };
  if (pending !== "ready") return <PendingRows phase={pending} />;
  return (
    <Animated.View entering={FadeIn.duration(260)} style={{ flex: 1 }}>
      <LegendList
        ref={ref}
        contentInsetAdjustmentBehavior={insets === null ? "automatic" : "never"}
        // As padding, which Legend List measures, not a native content
        // inset, which it counts again: a short list would scroll by it.
        contentContainerStyle={
          inset === undefined
            ? undefined
            : { paddingBottom: inset.bottom, paddingTop: inset.top }
        }
        scrollIndicatorInsets={inset}
        // A short list still gives under the finger, as a table view does.
        alwaysBounceVertical={inset !== undefined}
        keyboardDismissMode="on-drag"
        estimatedItemSize={72}
        // Rows are drawn well ahead of the scroll, so a fast fling on a slow
        // phone doesn't outrun them and show them appearing at the edges.
        drawDistance={DRAW_DISTANCE}
        recycleItems={false}
        ListHeaderComponent={<PillRoom offline={offline} pill={pill} />}
        {...props}
        {...(steady && { ...held.listProps, data: held.data })}
        style={[
          {
            backgroundColor:
              typeof background === "string" ? background : undefined,
            flex: 1,
          },
          props.style,
        ]}
      />
    </Animated.View>
  );
}
