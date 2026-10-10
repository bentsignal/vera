import { useState } from "react";
import { FieldGroup, Row, Spacer, Text } from "@expo/ui";

import { useVisibleAccounts } from "~/features/messaging/account";
import { useAccountNames } from "~/features/messaging/directory";
import { fillRow } from "~/lib/ui-modifiers";
import { AccountMenu } from "./account-menu";

/**
 * Which signed-in account a new conversation or space comes from. Starts
 * at the account the Inbox is filtered to, or the first one.
 */
export function useFromAccount() {
  const visible = useVisibleAccounts();
  const [from, setFrom] = useState(visible[0]?.address ?? "");
  return { from, setFrom };
}

/**
 * A "From" row with the account on its trailing edge, opening a menu of
 * the signed-in accounts. Shown only with several.
 */
export function FromSection({
  from,
  onChange,
}: {
  from: string;
  onChange: (address: string) => void;
}) {
  const accounts = useAccountNames();
  if (accounts.length < 2) return null;
  return (
    <FieldGroup.Section>
      <Row alignment="center" modifiers={fillRow}>
        <Text>From</Text>
        <Spacer flexible />
        <AccountMenu value={from} accounts={accounts} onChange={onChange} />
      </Row>
    </FieldGroup.Section>
  );
}
