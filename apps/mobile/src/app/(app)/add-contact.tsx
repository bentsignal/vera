import { Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { useDismissKeyboardOnDrag } from "~/features/compose/dismiss-keyboard-on-drag";
import { PeoplePicker } from "~/features/compose/people-picker";
import { SheetKeyboardLock } from "~/features/compose/sheet-keyboard";
import { usePeopleSearch } from "~/features/compose/use-people-search";
import { useContactActions, useContacts } from "~/features/contacts/contacts";
import { AccountScope } from "~/features/messaging/account";
import { dismissKeyboardOnScroll } from "~/lib/ui-modifiers";

/** Picking someone adds them, shown in Contacts right away. */
function AddContact() {
  const router = useRouter();
  const dragDismiss = useDismissKeyboardOnDrag();
  const contacts = useContacts() ?? [];
  const { save } = useContactActions();
  const search = usePeopleSearch({
    exclude: contacts.map((contact) => contact.accountId),
  });

  function add(accountId: string) {
    void save
      .mutateAsync({ accountId })
      .catch(() =>
        Alert.alert("Couldn't Add Contact", "Try again in a moment."),
      );
    router.dismiss();
  }

  return (
    <>
      <SheetKeyboardLock />
      <NativeHost style={{ flex: 1 }} {...dragDismiss}>
        <FieldList modifiers={dismissKeyboardOnScroll}>
          <PeoplePicker search={search} onPress={add} />
        </FieldList>
      </NativeHost>
    </>
  );
}

/** Adds someone to the `account` param's contacts. */
export default function AddContactScreen() {
  const { account } = useLocalSearchParams<{ account?: string }>();
  return (
    <AccountScope address={account}>
      <AddContact />
    </AccountScope>
  );
}
