import { useState } from "react";
import { FieldGroup, Text } from "@expo/ui";

import { showActionSheet } from "~/components/action-sheet";
import { ListItem } from "~/components/list-item";
import { useAccounts, useVisibleAccounts } from "~/features/messaging/account";
import { secondaryTextStyle } from "~/lib/colors";

/**
 * Which signed-in account a new conversation or space comes from. Starts
 * at the account the Inbox is filtered to, or the first one.
 */
export function useFromAccount() {
  const visible = useVisibleAccounts();
  const [from, setFrom] = useState(visible[0]?.address ?? "");
  return { from, setFrom };
}

/** A "From" row that switches accounts, shown only with several. */
export function FromSection({
  from,
  onChange,
}: {
  from: string;
  onChange: (address: string) => void;
}) {
  const accounts = useAccounts();
  if (accounts.length < 2) return null;
  return (
    <FieldGroup.Section>
      <ListItem
        supportingText={<Text textStyle={secondaryTextStyle}>{from}</Text>}
        onPress={() =>
          showActionSheet(
            accounts.map((account) => ({
              label: account.address,
              onPress: () => onChange(account.address),
            })),
          )
        }
      >
        From
      </ListItem>
    </FieldGroup.Section>
  );
}
