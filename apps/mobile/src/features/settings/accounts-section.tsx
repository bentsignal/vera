import { ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { FieldGroup, Text } from "@expo/ui";

import type { StoredAccount } from "~/features/session/account-store";
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
import { useSession } from "~/features/session/session-provider";
import { nativeColors, secondaryTextStyle } from "~/lib/colors";
import { removeUnreachableAccount } from "./sign-out";

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
          pathname: "/more/account",
        })
      }
    >
      <Text textStyle={{ fontSize: 17, fontWeight: "600" }}>{displayName}</Text>
    </ListItem>
  );
}

/**
 * An account whose home server can't be found, in red with a warning sign
 * so it stands out from the ones that work. It's left out of the app until
 * the server is back; tapping it tries again (a spinner while it looks) or
 * removes it.
 */
function UnreachableAccountRow({ account }: { account: StoredAccount }) {
  const { retrying, retryUnreachable } = useSession();
  return (
    <ListItem
      leading={<Avatar name={account.address} size="md" uri={null} />}
      trailing={
        retrying ? (
          <ActivityIndicator />
        ) : (
          <SymbolIcon
            name={{ android: "error", ios: "exclamationmark.circle.fill" }}
            size={20}
            tintColorClassName="accent-destructive"
          />
        )
      }
      supportingText={
        <Text
          textStyle={{ ...secondaryTextStyle, color: nativeColors.destructive }}
        >
          {`Can't reach ${account.domain}`}
        </Text>
      }
      onPress={() =>
        Alert.alert(
          `Can't Reach ${account.domain}`,
          "This account is hidden until its server is back. If the server is gone for good, remove the account from this device.",
          [
            { style: "cancel", text: "Cancel" },
            { onPress: retryUnreachable, text: "Try Again" },
            {
              onPress: () => removeUnreachableAccount(account),
              style: "destructive",
              text: "Remove Account",
            },
          ],
        )
      }
    >
      <Text textStyle={{ fontSize: 17, fontWeight: "600" }}>
        {account.address.slice(0, account.address.lastIndexOf("@"))}
      </Text>
    </ListItem>
  );
}

/**
 * Every signed-in account, like the accounts list in a mail app, with any
 * whose server can't be reached at the end. The plus in the header adds
 * one, on the right where a thumb reaches it.
 */
export function AccountsSection() {
  const router = useRouter();
  const accounts = useAccounts();
  const { unreachable } = useSession();
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
      {unreachable.map((account) => (
        <UnreachableAccountRow key={account.address} account={account} />
      ))}
    </FieldGroup.Section>
  );
}
