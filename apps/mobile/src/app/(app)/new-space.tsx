import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Button, FieldGroup, Text, TextInput } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { useSpaceActions } from "~/features/messaging/spaces";

export default function NewSpaceScreen() {
  const router = useRouter();
  const { createSpace } = useSpaceActions();
  const [name, setName] = useState("");

  async function create() {
    try {
      const { spaceId } = await createSpace.mutateAsync({ name: name.trim() });
      router.dismiss();
      router.push({ params: { spaceId }, pathname: "/spaces/[spaceId]" });
    } catch {
      Alert.alert("Couldn't Create Space", "Try again in a moment.");
    }
  }

  return (
    <NativeHost style={{ flex: 1 }}>
      <FieldGroup>
        <FieldGroup.Section title="Name">
          <TextInput
            autoFocus
            placeholder="Space name"
            onChangeText={setName}
          />
          <FieldGroup.SectionFooter>
            <Text>Spaces start with a #general channel.</Text>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>
        <FieldGroup.Section>
          <Button
            disabled={name.trim().length === 0 || createSpace.isPending}
            onPress={() => void create()}
          >
            <Text>Create Space</Text>
          </Button>
        </FieldGroup.Section>
      </FieldGroup>
    </NativeHost>
  );
}
