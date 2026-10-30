import type { Contact } from "@decentralized-convex/messages";
import { Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FieldGroup } from "@expo/ui";

import { showActionSheet } from "~/components/action-sheet";
import { DestructiveButton } from "~/components/destructive-button";
import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { TextInput } from "~/components/text-input";
import { useContact } from "~/features/contacts/contacts";
import { useContactEditor } from "~/features/contacts/use-contact-editor";
import { AccountScope } from "~/features/messaging/account";
import { ProfileSection } from "~/features/settings/profile-section";
import { dismissKeyboardOnScroll } from "~/lib/ui-modifiers";

function EditContact({ contact }: { contact: Contact }) {
  const router = useRouter();
  const editor = useContactEditor(contact);
  const photoActions = [
    { label: "Take Photo", onPress: () => void editor.changePhoto("camera") },
    {
      label: "Choose from Library",
      onPress: () => void editor.changePhoto("library"),
    },
    ...(editor.hasOwnPhoto
      ? [{ label: "Use Their Photo", onPress: editor.restoreTheirPhoto }]
      : []),
  ];

  function confirmRemove() {
    Alert.alert(`Remove ${editor.displayName} from Contacts?`, undefined, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          editor.remove();
          router.back();
        },
        style: "destructive",
        text: "Remove",
      },
    ]);
  }

  return (
    <NativeHost style={{ flex: 1 }}>
      <FieldList modifiers={dismissKeyboardOnScroll}>
        <ProfileSection
          displayName={editor.displayName}
          address={contact.accountId}
          avatarUrl={editor.avatarUrl}
          uploading={editor.uploading}
          onChangePhoto={() => showActionSheet(photoActions)}
        />
        <FieldGroup.Section title="Name">
          <TextInput
            defaultValue={editor.savedName}
            placeholder={editor.ownName}
            autoComplete="off"
            onChangeText={editor.changeName}
          />
        </FieldGroup.Section>
        <FieldGroup.Section>
          <DestructiveButton
            label="Remove from Contacts"
            onPress={confirmRemove}
          />
        </FieldGroup.Section>
      </FieldList>
    </NativeHost>
  );
}

function ContactEditor({ address }: { address: string }) {
  const contact = useContact(address);
  // Removing them goes back; until then the screen keeps what it had.
  if (contact == null) return null;
  return <EditContact contact={contact} />;
}

/** Your name and photo for a contact, or removing them. */
export default function EditContactScreen() {
  const { account, address } = useLocalSearchParams<{
    account?: string;
    address: string;
  }>();
  return (
    <AccountScope address={account}>
      <ContactEditor address={address} />
    </AccountScope>
  );
}
