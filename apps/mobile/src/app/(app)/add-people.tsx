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
import { useSpace, useSpaceActions } from "~/features/messaging/spaces";
import { dismissKeyboardOnScroll } from "~/lib/ui-modifiers";

function AddPeople({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const dragDismiss = useDismissKeyboardOnDrag();
  const { invite } = useSpaceActions();
  const { space } = useSpace(spaceId);
  const [members, setMembers] = useState<string[]>([]);
  const search = usePeopleSearch({
    exclude: [
      ...(space?.members ?? []).map((member) => member.accountId),
      ...(space?.invited ?? []),
    ],
    selected: members,
  });

  function toggle(address: string) {
    if (members.includes(address)) {
      setMembers(members.filter((member) => member !== address));
      return;
    }
    setMembers([...members, address]);
  }

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

export default function AddPeopleScreen() {
  const { account, spaceId } = useLocalSearchParams<{
    account?: string;
    spaceId: string;
  }>();
  return (
    <AccountScope address={account}>
      <AddPeople spaceId={spaceId} />
    </AccountScope>
  );
}
