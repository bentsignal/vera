import { useState } from "react";
import { Alert } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { pdsMutation } from "@decentralized-convex/tanstack-query";
import { FieldGroup, ListItem, Text, TextInput } from "@expo/ui";
import { pds } from "@vera/backend/pds";

import { Avatar } from "~/components/avatar";
import { NativeHost } from "~/components/native-host";
import { sheetIcons, useCloseSheet } from "~/features/compose/sheet";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { useProfiles } from "~/features/messaging/profiles";
import { secondaryTextStyle } from "~/lib/colors";
import { nestedListItemColors } from "~/lib/ui-modifiers";

/** Names the group picked on the previous step and creates it. */
function NewGroup({ members }: { members: string[] }) {
  const router = useRouter();
  const closeSheet = useCloseSheet();
  const { address: self } = useAccount();
  const profileOf = useProfiles(members);
  const [name, setName] = useState("");
  const createGroup = useMutation(
    pdsMutation({ mutation: pds.messages.createGroup, session: self }),
  );

  async function create() {
    const created = await createGroup
      .mutateAsync({ members, name: name.trim() })
      .catch(() => null);
    if (created === null) {
      Alert.alert("Couldn't Create Group", "Try again in a moment.");
      return;
    }
    closeSheet();
    router.push({
      params: {
        account: self,
        conversationId: created.conversationId,
        title: name.trim(),
      },
      pathname: "/conversation/[conversationId]",
    });
  }

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={sheetIcons.done}
          accessibilityLabel="Create Group"
          variant="prominent"
          disabled={name.trim().length === 0 || createGroup.isPending}
          onPress={() => void create()}
        />
      </Stack.Toolbar>
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup>
          <FieldGroup.Section title="Group Name">
            <TextInput autoFocus placeholder="Name" onChangeText={setName} />
          </FieldGroup.Section>
          <FieldGroup.Section title="Members">
            {members.map((address) => (
              <ListItem
                key={address}
                colors={nestedListItemColors}
                leading={
                  <Avatar
                    name={profileOf(address).displayName}
                    size="sm"
                    uri={profileOf(address).avatarUrl}
                  />
                }
                supportingText={
                  <Text textStyle={secondaryTextStyle}>{address}</Text>
                }
              >
                {profileOf(address).displayName}
              </ListItem>
            ))}
          </FieldGroup.Section>
        </FieldGroup>
      </NativeHost>
    </>
  );
}

export default function NewGroupScreen() {
  const { account, members } = useLocalSearchParams<{
    /** The account the group comes from. */
    account?: string;
    /** Comma-separated addresses picked on the first step. */
    members?: string;
  }>();
  return (
    <AccountScope address={account}>
      <NewGroup
        members={(members ?? "").split(",").filter((item) => item !== "")}
      />
    </AccountScope>
  );
}
