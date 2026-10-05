import { Platform } from "react-native";
import { Stack } from "expo-router";
import FilterAlt from "@expo/material-symbols/filter_alt.xml";
import FilterList from "@expo/material-symbols/filter_list.xml";

import type { InboxFrom, InboxShow } from "~/features/preferences/store";
import { setPreference } from "~/features/preferences/store";

function filterIcon(filtered: boolean) {
  if (Platform.OS !== "ios") return filtered ? FilterAlt : FilterList;
  return filtered
    ? "line.3.horizontal.decrease.circle.fill"
    : "line.3.horizontal.decrease.circle";
}

/**
 * The Inbox's left header button: a menu that narrows it to unread
 * conversations, or to chats or channels. (A space's conversations are on
 * its screen in Spaces.) The icon fills while a filter is on; the choice is
 * saved with the other preferences.
 */
export function FilterToolbar({
  show,
  from,
}: {
  show: InboxShow;
  from: InboxFrom;
}) {
  return (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Menu
        icon={filterIcon(show !== "all" || from !== "everything")}
        accessibilityLabel="Filter"
      >
        <Stack.Toolbar.Menu inline title="Show">
          <Stack.Toolbar.MenuAction
            isOn={show === "all"}
            onPress={() => setPreference("inboxShow", "all")}
          >
            All
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            isOn={show === "unread"}
            onPress={() => setPreference("inboxShow", "unread")}
          >
            Unread
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Menu inline title="From">
          <Stack.Toolbar.MenuAction
            isOn={from === "everything"}
            onPress={() => setPreference("inboxFrom", "everything")}
          >
            Everything
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            isOn={from === "chats"}
            onPress={() => setPreference("inboxFrom", "chats")}
          >
            Chats
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            isOn={from === "channels"}
            onPress={() => setPreference("inboxFrom", "channels")}
          >
            Channels
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}
