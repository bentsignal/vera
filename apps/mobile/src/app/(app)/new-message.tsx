import { useState } from "react";
import { useRouter } from "expo-router";
import { FieldGroup, ListItem, Text, TextInput } from "@expo/ui";

import { Avatar } from "~/components/avatar";
import { NativeHost } from "~/components/native-host";
import { secondaryTextStyle } from "~/lib/colors";
import { me, people } from "~/mock/people";

const contacts = people.filter((person) => person.id !== me.id);

export default function NewMessageScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = contacts.filter(
    (person) =>
      person.displayName.toLowerCase().includes(needle) ||
      person.address.includes(needle),
  );

  function open(personId: string) {
    router.dismiss();
    router.push({
      pathname: "/conversation/[conversationId]",
      params: { conversationId: `dm-${personId}` },
    });
  }

  return (
    <NativeHost style={{ flex: 1 }}>
      <FieldGroup>
        <FieldGroup.Section>
          <TextInput
            autoFocus
            placeholder="To: name or address"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={setQuery}
          />
        </FieldGroup.Section>
        <FieldGroup.Section title="Suggested">
          {matches.map((person) => (
            <ListItem
              key={person.id}
              leading={<Avatar name={person.displayName} size="sm" />}
              supportingText={
                <Text textStyle={secondaryTextStyle}>{person.address}</Text>
              }
              onPress={() => open(person.id)}
            >
              {person.displayName}
            </ListItem>
          ))}
        </FieldGroup.Section>
      </FieldGroup>
    </NativeHost>
  );
}
