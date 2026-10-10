import { useRouter } from "expo-router";
import { FieldGroup, Text } from "@expo/ui";

import { Avatar } from "~/components/avatar";
import { ListItem } from "~/components/list-item";
import { SectionHeaderWithAdd } from "~/components/section-header";
import { SymbolIcon } from "~/components/symbol-icon";
import {
  AccountScope,
  useAccount,
  useAccounts,
} from "~/features/messaging/account";
import { useMyProfile } from "~/features/messaging/directory";
import { secondaryTextStyle } from "~/lib/colors";

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

/**
 * Every signed-in account, like the accounts list in a mail app. The plus
 * in the header adds one, on the right where a thumb reaches it.
 */
export function AccountsSection() {
  const router = useRouter();
  const accounts = useAccounts();
  return (
    <FieldGroup.Section>
      <FieldGroup.SectionHeader>
        <SectionHeaderWithAdd
          title="Accounts"
          onAdd={() => router.push("/add-account")}
        />
      </FieldGroup.SectionHeader>
      {accounts.map((account) => (
        <AccountScope key={account.address} address={account.address}>
          <AccountRow />
        </AccountScope>
      ))}
    </FieldGroup.Section>
  );
}
