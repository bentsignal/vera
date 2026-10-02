import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Button, FieldGroup, ListItem, Text } from "@expo/ui";

import { Avatar } from "~/components/avatar";
import { SymbolIcon } from "~/components/symbol-icon";
import {
  AccountScope,
  useAccount,
  useAccounts,
} from "~/features/messaging/account";
import { useMyProfile } from "~/features/messaging/directory";
import { secondaryTextStyle } from "~/lib/colors";
import { linkButton } from "~/lib/ui-modifiers";

function AccountRow() {
  const router = useRouter();
  const { address, username } = useAccount();
  const { profile } = useMyProfile();
  const displayName = profile?.displayName ?? username;
  return (
    <ListItem
      leading={
        <Avatar name={displayName} size="md" uri={profile?.avatarUrl ?? null} />
      }
      trailing={
        <SymbolIcon
          name={{ android: "chevron_right", ios: "chevron.right" }}
          size={14}
          weight="semibold"
          tintColorClassName="accent-subtle"
        />
      }
      supportingText={<Text textStyle={secondaryTextStyle}>{address}</Text>}
      onPress={() =>
        router.push({
          params: { account: address, title: displayName },
          pathname: "/settings/account",
        })
      }
    >
      <Text textStyle={{ fontSize: 17, fontWeight: "600" }}>{displayName}</Text>
    </ListItem>
  );
}

/** Every signed-in account, like the accounts list in a mail app. */
export function AccountsSection() {
  const router = useRouter();
  const accounts = useAccounts();
  return (
    <FieldGroup.Section title="Accounts">
      {accounts.map((account) => (
        <AccountScope key={account.address} address={account.address}>
          <AccountRow />
        </AccountScope>
      ))}
      <Button
        label="Add Account"
        variant="text"
        modifiers={linkButton}
        onPress={() => router.push("/add-account")}
      />
      <FieldGroup.SectionFooter>
        <Text>{`Vera ${Constants.expoConfig?.version ?? ""}`}</Text>
      </FieldGroup.SectionFooter>
    </FieldGroup.Section>
  );
}
