import { useRef, useState } from "react";
import { Alert } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { FieldGroup, ListItem, Text } from "@expo/ui";

import { Avatar } from "~/components/avatar";
import { NativeHost } from "~/components/native-host";
import { TextInput } from "~/components/text-input";
import { useDismissKeyboardOnDrag } from "~/features/compose/dismiss-keyboard-on-drag";
import { useGroupMembers } from "~/features/compose/group-members";
import { RemoveButton } from "~/features/compose/remove-button";
import { sheetIcons, useCloseSheet } from "~/features/compose/sheet";
import { AccountScope, useAccount } from "~/features/messaging/account";
import {
  groupTitle,
  useConversationActions,
} from "~/features/messaging/conversations";
import { newId } from "~/features/messaging/optimistic";
import { useProfiles } from "~/features/messaging/profiles";
import { secondaryTextStyle } from "~/lib/colors";
import {
  dismissKeyboardOnScroll,
  nestedListItemColors,
} from "~/lib/ui-modifiers";

/** A member of the group being made, with a button to remove them. */
function MemberRow({
  address,
  profile,
  onRemove,
}: {
  address: string;
  profile: { avatarUrl?: string | null; displayName: string };
  onRemove: () => void;
}) {
  const { avatarUrl, displayName } = profile;
  return (
    <ListItem
      colors={nestedListItemColors}
      leading={<Avatar name={displayName} size="sm" uri={avatarUrl} />}
      supportingText={<Text textStyle={secondaryTextStyle}>{address}</Text>}
      trailing={
        <RemoveButton
          label={`Remove ${displayName}`}
          onPress={() =>
            Alert.alert(`Remove ${displayName}?`, undefined, [
              { style: "cancel", text: "Cancel" },
              { onPress: onRemove, style: "destructive", text: "Remove" },
            ])
          }
        />
      }
    >
      {displayName}
    </ListItem>
  );
}

/**
 * Names the group picked on the previous step (or leaves it unnamed, titled
 * with its members), creates it, and opens it right away. Members can be
 * removed here too; removing the last one goes back to the picker, since a
 * group needs someone in it.
 */
function NewGroup() {
  const router = useRouter();
  const [members, setMembers] = useGroupMembers();
  const dragDismiss = useDismissKeyboardOnDrag();
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

  function remove(address: string) {
    const rest = members.filter((member) => member !== address);
    setMembers(rest);
    if (rest.length === 0) router.back();
  }

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
      <NativeHost style={{ flex: 1 }} {...dragDismiss}>
        <FieldGroup modifiers={dismissKeyboardOnScroll}>
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
              <MemberRow
                key={address}
                address={address}
                profile={profileOf(address)}
                onRemove={() => remove(address)}
              />
            ))}
          </FieldGroup.Section>
        </FieldGroup>
      </NativeHost>
    </>
  );
}

export default function NewGroupScreen() {
  const { account } = useLocalSearchParams<{
    /** The account the group comes from. */
    account?: string;
  }>();
  return (
    <AccountScope address={account}>
      <NewGroup />
    </AccountScope>
  );
}
