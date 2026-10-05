import { useState } from "react";
import { Alert } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { FieldGroup, TextInput } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { sheetIcons } from "~/features/compose/sheet";
import { AccountScope } from "~/features/messaging/account";
import { useSpaceActions } from "~/features/messaging/spaces";

function NewChannel({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const { createChannel } = useSpaceActions();
  const [name, setName] = useState("");

  async function create() {
    try {
      await createChannel.mutateAsync({ name: name.trim(), spaceId });
      router.dismiss();
    } catch {
      Alert.alert("Couldn't Create Channel", "Try again in a moment.");
    }
  }

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={sheetIcons.done}
          accessibilityLabel="Create Channel"
          variant="prominent"
          disabled={name.trim().length === 0 || createChannel.isPending}
          onPress={() => void create()}
        />
      </Stack.Toolbar>
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup>
          <FieldGroup.Section title="Channel Name">
            <TextInput
              autoFocus
              autoCapitalize="none"
              placeholder="new-channel"
              onChangeText={setName}
            />
          </FieldGroup.Section>
        </FieldGroup>
      </NativeHost>
    </>
  );
}

export default function NewChannelScreen() {
  const { account, spaceId } = useLocalSearchParams<{
    account?: string;
    spaceId: string;
  }>();
  return (
    <AccountScope address={account}>
      <NewChannel spaceId={spaceId} />
    </AccountScope>
  );
}
