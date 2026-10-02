import { useState } from "react";
import { Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, FieldGroup, Text, TextInput } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { toAddress, useAccountExists } from "~/features/messaging/directory";
import { useSpaceActions } from "~/features/messaging/spaces";

export default function AddPeopleScreen() {
  const router = useRouter();
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const { addMembers } = useSpaceActions();
  const [query, setQuery] = useState("");
  const address = toAddress(query);
  const exists = useAccountExists(address);

  async function add() {
    if (address === null) return;
    try {
      await addMembers.mutateAsync({ members: [address], spaceId });
      router.dismiss();
    } catch {
      Alert.alert("Couldn't Add Person", "Try again in a moment.");
    }
  }

  return (
    <NativeHost style={{ flex: 1 }}>
      <FieldGroup>
        <FieldGroup.Section title="Username or Address">
          <TextInput
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="username"
            onChangeText={setQuery}
          />
          {exists === false && (
            <FieldGroup.SectionFooter>
              <Text>{`No Vera account for ${address ?? ""}.`}</Text>
            </FieldGroup.SectionFooter>
          )}
        </FieldGroup.Section>
        <FieldGroup.Section>
          <Button
            disabled={exists !== true || addMembers.isPending}
            onPress={() => void add()}
          >
            <Text>Add to Space</Text>
          </Button>
        </FieldGroup.Section>
      </FieldGroup>
    </NativeHost>
  );
}
