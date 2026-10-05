import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useCSSVariable } from "uniwind";

import { useInbox } from "~/features/messaging/conversations";
import {
  blurNativeSearch,
  focusNativeSearch,
} from "~/features/search/native-search";

export default function TabsLayout() {
  const accent = useCSSVariable("--color-accent");
  const { conversations } = useInbox();
  // Channel unreads count here too, so Spaces has no badge of its own.
  const unread = (conversations ?? []).filter(
    ({ unreadCount }) => unreadCount > 0,
  ).length;
  return (
    <NativeTabs tintColor={typeof accent === "string" ? accent : undefined}>
      <NativeTabs.Trigger name="(inbox)">
        <NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "tray", selected: "tray.fill" }}
          md="inbox"
        />
        {unread > 0 && (
          <NativeTabs.Trigger.Badge>{String(unread)}</NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="spaces">
        <NativeTabs.Trigger.Label>Spaces</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
          md="grid_view"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gear" md="settings" />
      </NativeTabs.Trigger>
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
