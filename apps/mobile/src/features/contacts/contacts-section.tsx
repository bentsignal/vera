import type { Contact, MessagesFrom } from "@decentralized-convex/messages";
import { useRouter } from "expo-router";
import { FieldGroup, Row, Spacer, Text } from "@expo/ui";

import type { Choice } from "~/components/choice-menu";
import { Avatar } from "~/components/avatar";
import { ListItem } from "~/components/list-item";
import { OptimisticChoice } from "~/components/optimistic-choice";
import { AccountMenu } from "~/features/compose/account-menu";
import { useAccount } from "~/features/messaging/account";
import { useAccountNames } from "~/features/messaging/directory";
import { useProfiles } from "~/features/messaging/profiles";
import { secondaryTextStyle } from "~/lib/colors";
import { fillRow } from "~/lib/ui-modifiers";
import { usePrivacySettings } from "./contacts";

const MESSAGES_FROM_CHOICES = [
  { label: "Everyone", value: "everyone" },
  { label: "Contacts", value: "contacts" },
  { label: "Mutual Contacts", value: "mutual" },
] as const satisfies readonly Choice<MessagesFrom>[];

/**
 * Whose contacts the screen shows, at the trailing edge of an "Account"
 * row. Shown only with several accounts.
 */
export function ContactsAccountSection({
  account,
  onChange,
}: {
  account: string;
  onChange: (address: string) => void;
}) {
  const accounts = useAccountNames();
  if (accounts.length < 2) return null;
  return (
    <FieldGroup.Section>
      <Row alignment="center" modifiers={fillRow}>
        <Text>Account</Text>
        <Spacer flexible />
        <AccountMenu value={account} accounts={accounts} onChange={onChange} />
      </Row>
    </FieldGroup.Section>
  );
}

/**
 * Who can start a conversation with the account in use or add it to a
 * group. Hidden on servers without the setting.
 */
export function MessagesFromSection() {
  const { messagesFrom, setMessagesFrom } = usePrivacySettings();
  if (messagesFrom == null) return null;
  return (
    <FieldGroup.Section>
      <OptimisticChoice<MessagesFrom>
        label="Allow Messages From"
        value={messagesFrom}
        choices={MESSAGES_FROM_CHOICES}
        onChange={setMessagesFrom}
      />
    </FieldGroup.Section>
  );
}

/** The contacts, by the name shown for each; tapping one opens them. */
export function ContactList({ contacts }: { contacts: readonly Contact[] }) {
  const router = useRouter();
  const { address: account } = useAccount();
  const profileOf = useProfiles(contacts.map((contact) => contact.accountId));
  const sorted = [...contacts].sort((left, right) =>
    profileOf(left.accountId).displayName.localeCompare(
      profileOf(right.accountId).displayName,
    ),
  );
  return (
    <FieldGroup.Section>
      {sorted.length === 0 ? (
        <Text textStyle={secondaryTextStyle}>No Contacts</Text>
      ) : (
        sorted.map(({ accountId }) => {
          const { avatarUrl, displayName } = profileOf(accountId);
          return (
            <ListItem
              key={accountId}
              leading={<Avatar name={displayName} size="sm" uri={avatarUrl} />}
              supportingText={
                <Text textStyle={secondaryTextStyle}>{accountId}</Text>
              }
              onPress={() =>
                router.push({
                  params: { account, address: accountId },
                  pathname: "/profile/[address]",
                })
              }
            >
              {displayName}
            </ListItem>
          );
        })
      )}
    </FieldGroup.Section>
  );
}
