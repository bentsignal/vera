import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useCSSVariable } from "uniwind";

import { useActivityBadge } from "~/features/activity/activity";
import { useHomeBadge } from "~/features/home/home-badge";
import { usePreference } from "~/features/preferences/store";
import {
  blurNativeSearch,
  focusNativeSearch,
} from "~/features/search/native-search";

// Home is the tab the app opens to, even when the reversed tab bar puts it
// last.
export const unstable_settings = { initialRouteName: "(home)" };

export default function TabsLayout() {
  const accent = useCSSVariable("--color-accent");
  // Home's badge counts its unread rows; Activity's, what's about you
  // that you haven't seen yet.
  const home = useHomeBadge();
  const activity = useActivityBadge();
  const reversed = usePreference("reverseTabBar");
  const tabs = [
    // Native tabs give a tab's first scroll view the tab bar's inset; on
    // Home that's the pager, whose lists take the insets instead.
    <NativeTabs.Trigger
      key="(home)"
      name="(home)"
      disableAutomaticContentInsets
    >
      <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon
        sf={{ default: "house", selected: "house.fill" }}
        md="home"
      />
      {home > 0 && (
        <NativeTabs.Trigger.Badge>{String(home)}</NativeTabs.Trigger.Badge>
      )}
    </NativeTabs.Trigger>,
    <NativeTabs.Trigger key="activity" name="activity">
      <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon
        sf={{ default: "bell", selected: "bell.fill" }}
        md="notifications"
      />
      {activity > 0 && (
        <NativeTabs.Trigger.Badge>{String(activity)}</NativeTabs.Trigger.Badge>
      )}
    </NativeTabs.Trigger>,
    <NativeTabs.Trigger key="more" name="more">
      <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon
        sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
        md="grid_view"
      />
    </NativeTabs.Trigger>,
  ];
  return (
    <NativeTabs tintColor={typeof accent === "string" ? accent : undefined}>
      {reversed ? tabs.toReversed() : tabs}
      <NativeTabs.Trigger
        name="search"
        role="search"
        listeners={{ blur: blurNativeSearch, focus: focusNativeSearch }}
      >
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
