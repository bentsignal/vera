import { useState } from "react";
import { Alert } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { useDismissKeyboardOnDrag } from "~/features/compose/dismiss-keyboard-on-drag";
import { PeoplePicker } from "~/features/compose/people-picker";
import { sheetIcons } from "~/features/compose/sheet";
import { SheetKeyboardLock } from "~/features/compose/sheet-keyboard";
import { usePeopleSearch } from "~/features/compose/use-people-search";
import { AccountScope } from "~/features/messaging/account";
import {
  useConversation,
  useConversationActions,
} from "~/features/messaging/conversations";
import { useSpace, useSpaceActions } from "~/features/messaging/spaces";
import { dismissKeyboardOnScroll } from "~/lib/ui-modifiers";

/** The most people a group holds, as the PDS allows. */
const MAX_GROUP_MEMBERS = 50;

/** People picked here, toggled on and off. */
function usePicked(limit = Infinity) {
  const [members, setMembers] = useState<string[]>([]);
  function toggle(address: string) {
    if (members.includes(address)) {
      setMembers(members.filter((member) => member !== address));
      return;
    }
    if (members.length >= limit) {
      Alert.alert(
        "This Group Is Full",
        `Groups can have up to ${MAX_GROUP_MEMBERS} people.`,
      );
      return;
    }
    setMembers([...members, address]);
  }
  return [members, toggle] as const;
}

function InviteToSpace({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const dragDismiss = useDismissKeyboardOnDrag();
  const { invite } = useSpaceActions();
  const { space } = useSpace(spaceId);
  const [members, toggle] = usePicked();
  const search = usePeopleSearch({
    exclude: [
      ...(space?.members ?? []).map((member) => member.accountId),
      ...(space?.invited ?? []),
    ],
    selected: members,
  });

  /** Invites them, shown as invited right away. */
  function send() {
    void invite
      .mutateAsync({ members, spaceId })
      .catch(() =>
        Alert.alert("Couldn't Invite People", "Try again in a moment."),
      );
    router.dismiss();
  }

  return (
    <>
      <SheetKeyboardLock />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={sheetIcons.done}
          accessibilityLabel="Send Invites"
          variant="prominent"
          disabled={members.length === 0}
          onPress={send}
        />
      </Stack.Toolbar>
      <NativeHost style={{ flex: 1 }} {...dragDismiss}>
        <FieldList modifiers={dismissKeyboardOnScroll}>
          <PeoplePicker
            search={search}
            selected={members}
            footer="They join once they accept."
            onPress={toggle}
          />
        </FieldList>
      </NativeHost>
    </>
  );
}

/** Anyone in a group adds people straight in, no invitation needed. */
function AddToGroup({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const dragDismiss = useDismissKeyboardOnDrag();
  const { addGroupMembers } = useConversationActions();
  const { conversation } = useConversation(conversationId);
  const current = conversation?.members ?? [];
  const [members, toggle] = usePicked(MAX_GROUP_MEMBERS - current.length);
  const search = usePeopleSearch({ exclude: current, selected: members });

  /** Adds them, shown as members right away. */
  function add() {
    void addGroupMembers
      .mutateAsync({ conversationId, members })
      .catch(() =>
        Alert.alert("Couldn't Add People", "Try again in a moment."),
      );
    router.dismiss();
  }

  return (
    <>
      <SheetKeyboardLock />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={sheetIcons.done}
          accessibilityLabel="Add People"
          variant="prominent"
          disabled={members.length === 0}
          onPress={add}
        />
      </Stack.Toolbar>
      <NativeHost style={{ flex: 1 }} {...dragDismiss}>
        <FieldList modifiers={dismissKeyboardOnScroll}>
          <PeoplePicker
            search={search}
            selected={members}
            footer="They'll see the group's earlier messages too."
            pickedFor="groups"
            onPress={toggle}
          />
        </FieldList>
      </NativeHost>
    </>
  );
}

/** Invites people to a space, or adds them to a group. */
export default function AddPeopleScreen() {
  const { account, conversationId, spaceId } = useLocalSearchParams<{
    account?: string;
    /** A group to add people to. */
    conversationId?: string;
    /** A space to invite people to. */
    spaceId?: string;
  }>();
  return (
    <AccountScope address={account}>
      {conversationId === undefined ? (
        <InviteToSpace spaceId={spaceId ?? ""} />
      ) : (
        <AddToGroup conversationId={conversationId} />
      )}
    </AccountScope>
  );
}
