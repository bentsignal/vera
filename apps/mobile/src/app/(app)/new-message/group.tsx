import { useRef, useState } from "react";
import { Alert } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { FieldGroup, ListItem, Text, TextInput } from "@expo/ui";

import { Avatar } from "~/components/avatar";
import { NativeHost } from "~/components/native-host";
import { sheetIcons, useCloseSheet } from "~/features/compose/sheet";
import { AccountScope, useAccount } from "~/features/messaging/account";
import {
  groupTitle,
  useConversationActions,
} from "~/features/messaging/conversations";
import { newId } from "~/features/messaging/optimistic";
import { useProfiles } from "~/features/messaging/profiles";
import { secondaryTextStyle } from "~/lib/colors";
import { nestedListItemColors } from "~/lib/ui-modifiers";

/**
 * Names the group picked on the previous step (or leaves it unnamed, titled
 * with its members), creates it, and opens it right away.
 */
function NewGroup({ members }: { members: string[] }) {
  const router = useRouter();
  const closeSheet = useCloseSheet();
  const { address: self } = useAccount();
  const profileOf = useProfiles(members);
  const [name, setName] = useState("");
  const { createGroup } = useConversationActions();
  // The sheet closes as it creates; a second tap must not make another.
  const created = useRef(false);
  const unnamedTitle = groupTitle(
    null,
    members,
    self,
    (address) => profileOf(address).displayName,
  );

  function create() {
    if (created.current) return;
    created.current = true;
    const conversationId = newId("group", self);
    const groupName = name.trim();
    void createGroup
      .mutateAsync({
        conversationId,
        members,
        ...(groupName === "" ? {} : { name: groupName }),
      })
      .catch(() =>
        Alert.alert("Couldn't Create Group", "Try again in a moment."),
      );
    closeSheet();
    router.push({
      params: {
        account: self,
        conversationId,
        title: groupName === "" ? unnamedTitle : groupName,
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
          onPress={create}
        />
      </Stack.Toolbar>
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup>
          <FieldGroup.Section title="Group Name">
            {/* Optional: without one, the group shows its members' names. */}
            <TextInput
              autoFocus
              placeholder={unnamedTitle}
              onChangeText={setName}
            />
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
