import { useState } from "react";
import Check from "@expo/material-symbols/check.xml";
import {
  Column,
  DropdownMenu,
  DropdownMenuItem,
  Icon,
  Text,
  TextButton,
  useMaterialColors,
} from "@expo/ui/jetpack-compose";
import { padding } from "@expo/ui/jetpack-compose/modifiers";

import type { AccountChoice } from "./account-menu";

/** Room above and below each two-line item, which Compose sizes for one. */
const ITEM_PADDING = [padding(0, 8, 0, 8)];

export type { AccountChoice } from "./account-menu";

/**
 * Android `AccountMenu`: the current account's name as a text button (like
 * `ChoiceMenu`) with a dropdown of every account, name over address, the
 * current one checked. See `account-menu.tsx`.
 */
export function AccountMenu({
  value,
  accounts,
  onChange,
}: {
  value: string;
  accounts: readonly AccountChoice[];
  onChange: (address: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const colors = useMaterialColors();
  const current = accounts.find((account) => account.address === value);
  return (
    <DropdownMenu
      expanded={expanded}
      onDismissRequest={() => setExpanded(false)}
    >
      <DropdownMenu.Trigger>
        <TextButton onClick={() => setExpanded(true)}>
          <Text>{`${current?.name ?? value} ▾`}</Text>
        </TextButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Items>
        {accounts.map((account) => (
          <DropdownMenuItem
            key={account.address}
            onClick={() => {
              setExpanded(false);
              onChange(account.address);
            }}
          >
            <DropdownMenuItem.Text>
              <Column modifiers={ITEM_PADDING}>
                <Text style={{ typography: "bodyLarge" }}>{account.name}</Text>
                <Text
                  color={colors.onSurfaceVariant}
                  style={{ typography: "bodyMedium" }}
                >
                  {account.address}
                </Text>
              </Column>
            </DropdownMenuItem.Text>
            <DropdownMenuItem.TrailingIcon>
              {account.address === value ? (
                <Icon source={Check} size={24} contentDescription="Current" />
              ) : null}
            </DropdownMenuItem.TrailingIcon>
          </DropdownMenuItem>
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
