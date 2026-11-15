import { useState } from "react";
import { Platform } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Stack, useRouter } from "expo-router";
import PersonAdd from "@expo/material-symbols/person_add.xml";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { useContacts } from "~/features/contacts/contacts";
import {
  ContactList,
  ContactsAccountSection,
  MessagesFromSection,
} from "~/features/contacts/contacts-section";
import { AccountScope, useAccounts } from "~/features/messaging/account";

function Contacts({
  account,
  onChangeAccount,
}: {
  account: string;
  onChangeAccount: (address: string) => void;
}) {
  const router = useRouter();
  const contacts = useContacts();
  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={Platform.OS === "ios" ? "person.badge.plus" : PersonAdd}
          accessibilityLabel="Add Contact"
          onPress={() =>
            router.push({ params: { account }, pathname: "/add-contact" })
          }
        />
      </Stack.Toolbar>
      {/* Shown once the contacts have loaded, fading in. */}
      {contacts !== undefined && (
        <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1 }}>
          <NativeHost style={{ flex: 1 }}>
            <FieldList>
              <ContactsAccountSection
                account={account}
                onChange={onChangeAccount}
              />
              <MessagesFromSection />
              <ContactList contacts={contacts} />
            </FieldList>
          </NativeHost>
        </Animated.View>
      )}
    </>
  );
}

/**
 * The people you added, with who can message you, for one signed-in
 * account at a time.
 */
export default function ContactsScreen() {
  const accounts = useAccounts();
  const [account, setAccount] = useState(accounts[0]?.address ?? "");
  return (
    <AccountScope address={account}>
      <Stack.Screen options={{ headerLargeTitleEnabled: false }} />
      <Stack.Title>Contacts</Stack.Title>
      <Contacts account={account} onChangeAccount={setAccount} />
    </AccountScope>
  );
}
