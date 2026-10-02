import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useCSSVariable } from "uniwind";

import { useInbox } from "~/features/messaging/conversations";
import { useSpaces } from "~/features/messaging/spaces";
import {
  blurNativeSearch,
  focusNativeSearch,
} from "~/features/search/native-search";

export default function TabsLayout() {
  const accent = useCSSVariable("--color-accent");
  const { conversations } = useInbox();
  const { spaces } = useSpaces();
  const unreadChats = (conversations ?? []).filter(
    ({ unreadCount }) => unreadCount > 0,
  ).length;
  const unreadSpaces = spaces.filter(
    ({ unreadCount }) => unreadCount > 0,
  ).length;
  return (
    <NativeTabs tintColor={typeof accent === "string" ? accent : undefined}>
      <NativeTabs.Trigger name="(chats)">
        <NativeTabs.Trigger.Label>Chats</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: "bubble.left.and.bubble.right",
            selected: "bubble.left.and.bubble.right.fill",
          }}
          md="forum"
        />
        {unreadChats > 0 && (
          <NativeTabs.Trigger.Badge>
            {String(unreadChats)}
          </NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="spaces">
        <NativeTabs.Trigger.Label>Spaces</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
          md="grid_view"
        />
        {unreadSpaces > 0 && (
          <NativeTabs.Trigger.Badge>
            {String(unreadSpaces)}
          </NativeTabs.Trigger.Badge>
        )}
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
