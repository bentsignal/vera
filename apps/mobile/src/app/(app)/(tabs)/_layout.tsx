import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useCSSVariable } from "uniwind";

import { inbox } from "~/mock/inbox";

const unreadChats = inbox.filter(({ unreadCount }) => unreadCount > 0).length;

export default function TabsLayout() {
  const accent = useCSSVariable("--color-accent");
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
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gear" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
