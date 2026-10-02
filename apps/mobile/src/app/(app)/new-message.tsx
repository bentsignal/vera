import { Button, FieldGroup, Text, TextInput } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { NewAddressRow } from "~/features/compose/new-address-row";
import { PeopleSection } from "~/features/compose/people-section";
import { useCompose } from "~/features/compose/use-compose";

export default function NewMessageScreen() {
  const compose = useCompose();
  return (
    <NativeHost style={{ flex: 1 }}>
      <FieldGroup>
        <FieldGroup.Section>
          <TextInput
            key={compose.fieldKey}
            autoFocus
            placeholder="To: username or address"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={compose.setQuery}
          />
        </FieldGroup.Section>
        {compose.newAddress !== null && (
          <NewAddressRow
            address={compose.newAddress}
            displayName={compose.displayName}
            onAdd={compose.add}
          />
        )}
        <PeopleSection
          title="To"
          addresses={compose.recipients}
          displayName={compose.displayName}
          onPress={compose.remove}
        />
        {compose.isGroup && (
          <FieldGroup.Section title="Group Name">
            <TextInput placeholder="Name" onChangeText={compose.setGroupName} />
          </FieldGroup.Section>
        )}
        {compose.recipients.length > 0 && (
          <FieldGroup.Section>
            <Button
              disabled={!compose.canStart}
              onPress={() => void compose.start()}
            >
              <Text>{compose.isGroup ? "Create Group" : "Message"}</Text>
            </Button>
          </FieldGroup.Section>
        )}
        <PeopleSection
          title="Suggested"
          addresses={compose.suggestions}
          displayName={compose.displayName}
          onPress={compose.add}
        />
      </FieldGroup>
    </NativeHost>
  );
}
