import { useState } from "react";
import { Alert } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { PeoplePicker } from "~/features/compose/people-picker";
import { sheetIcons, useCloseSheet } from "~/features/compose/sheet";
import { usePeopleSearch } from "~/features/compose/use-people-search";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { useSpaceActions } from "~/features/messaging/spaces";

/** Picks who to invite, then creates the space named on the previous step. */
function NewSpacePeople({ name }: { name: string }) {
  const router = useRouter();
  const closeSheet = useCloseSheet();
  const { address: self } = useAccount();
  const { createSpace, invite } = useSpaceActions();
  const [members, setMembers] = useState<string[]>([]);
  const search = usePeopleSearch({ selected: members });
  const isPending = createSpace.isPending || invite.isPending;

  function toggle(address: string) {
    if (members.includes(address)) {
      setMembers(members.filter((member) => member !== address));
      return;
    }
    setMembers([...members, address]);
    search.clear();
  }

  async function create() {
    const created = await createSpace.mutateAsync({ name }).catch(() => null);
    if (created === null) {
      Alert.alert("Couldn't Create Space", "Try again in a moment.");
      return;
    }
    if (members.length > 0) {
      // The space exists either way; people can be invited again from it.
      await invite
        .mutateAsync({ members, spaceId: created.spaceId })
        .catch(() =>
          Alert.alert(
            "Couldn't Invite People",
            "The space was created. Invite people from its Members list.",
          ),
        );
    }
    closeSheet();
    router.push({
      params: { account: self, name, spaceId: created.spaceId },
      pathname: "/spaces/[spaceId]",
    });
  }

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={sheetIcons.done}
          accessibilityLabel="Create Space"
          variant="prominent"
          disabled={isPending}
          onPress={() => void create()}
        />
      </Stack.Toolbar>
      <NativeHost style={{ flex: 1 }}>
        <FieldList>
          <PeoplePicker
            search={search}
            selected={members}
            footer="Invite people now, or later from the space. They join once they accept."
            onPress={toggle}
          />
        </FieldList>
      </NativeHost>
    </>
  );
}

export default function NewSpacePeopleScreen() {
  const { account, name } = useLocalSearchParams<{
    /** The account the space comes from. */
    account?: string;
    name?: string;
  }>();
  return (
    <AccountScope address={account}>
      <NewSpacePeople name={name ?? ""} />
    </AccountScope>
  );
}
