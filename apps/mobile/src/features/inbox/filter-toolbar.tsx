import { Platform } from "react-native";
import { Stack } from "expo-router";
import FilterAlt from "@expo/material-symbols/filter_alt.xml";
import FilterList from "@expo/material-symbols/filter_list.xml";

import type { InboxFrom, InboxShow } from "~/features/preferences/store";
import { useSpaces } from "~/features/messaging/spaces";
import {
  isSpaceFilter,
  setPreference,
  usePreference,
} from "~/features/preferences/store";

function filterIcon(filtered: boolean) {
  if (Platform.OS !== "ios") return filtered ? FilterAlt : FilterList;
  return filtered
    ? "line.3.horizontal.decrease.circle.fill"
    : "line.3.horizontal.decrease.circle";
}

/**
 * The Inbox's left header button: a menu that narrows it to unread
 * conversations, to chats or channels, or to one space. The icon fills
 * while a filter is on; the choice is saved with the other preferences.
 */
export function FilterToolbar({
  show,
  from,
}: {
  show: InboxShow;
  from: InboxFrom;
}) {
  const { spaces } = useSpaces();
  // One entry per space, even when several accounts are in it.
  const spaceNames = new Map<`space:${string}`, string>();
  for (const space of spaces) {
    if (isSpaceFilter(space.spaceId)) spaceNames.set(space.spaceId, space.name);
  }
  const spaceChoices = [...spaceNames];
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
        <Stack.Toolbar.Menu
          inline
          title="Spaces"
          hidden={spaceChoices.length === 0}
        >
          {spaceChoices.map(([spaceId, name]) => (
            <Stack.Toolbar.MenuAction
              key={spaceId}
              isOn={from === spaceId}
              onPress={() => setPreference("inboxFrom", spaceId)}
            >
              {name}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}

/** The saved space filter, unless that space is gone (left or deleted). */
export function useInboxFrom() {
  const stored = usePreference("inboxFrom");
  const { isLoading, spaces } = useSpaces();
  const gone =
    isSpaceFilter(stored) &&
    !isLoading &&
    !spaces.some((space) => space.spaceId === stored);
  return gone ? "everything" : stored;
}
