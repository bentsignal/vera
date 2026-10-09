import { useRef, useState } from "react";
import { Alert } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { FieldGroup, TextInput } from "@expo/ui";

import { NativeHost } from "~/components/native-host";
import { sheetIcons } from "~/features/compose/sheet";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { newId } from "~/features/messaging/optimistic";
import { useSpaceActions } from "~/features/messaging/spaces";

function NewChannel({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const { address: self } = useAccount();
  const { createChannel } = useSpaceActions();
  const [name, setName] = useState("");
  // The sheet closes as it creates; a second tap must not make another.
  const created = useRef(false);

  function create() {
    if (created.current) return;
    created.current = true;
    const args = {
      conversationId: newId("channel", self),
      name: name.trim(),
      spaceId,
    };
    void createChannel
      .mutateAsync(args)
      .catch(() =>
        Alert.alert("Couldn't Create Channel", "Try again in a moment."),
      );
    router.dismiss();
  }

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={sheetIcons.done}
          accessibilityLabel="Create Channel"
          variant="prominent"
          disabled={name.trim().length === 0}
          onPress={create}
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
