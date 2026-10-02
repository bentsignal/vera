import type { ReactNode } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import Group from "@expo/material-symbols/group.xml";

import { setAccountFilter } from "./account-store";
import { useSession } from "./session-provider";

/**
 * The right side of the Chats and Spaces headers: a menu that narrows them
 * to one account (like a mail app's mailbox list, hidden with one account),
 * then the screen's own `children` buttons. Toolbar items must be its
 * direct children, so the menu can't be a separate component.
 */
export function AccountToolbar({ children }: { children: ReactNode }) {
  const { accounts, filter } = useSession();
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu
        hidden={accounts.length < 2}
        icon={
          Platform.OS === "ios"
            ? filter === null
              ? "person.2.circle"
              : "person.crop.circle"
            : Group
        }
        accessibilityLabel="Show accounts"
      >
        <Stack.Toolbar.MenuAction
          isOn={filter === null}
          onPress={() => setAccountFilter(null)}
        >
          All Accounts
        </Stack.Toolbar.MenuAction>
        {accounts.map((account) => (
          <Stack.Toolbar.MenuAction
            key={account.address}
            isOn={filter === account.address}
            onPress={() => setAccountFilter(account.address)}
          >
            {account.address}
          </Stack.Toolbar.MenuAction>
        ))}
      </Stack.Toolbar.Menu>
      {children}
    </Stack.Toolbar>
  );
}
