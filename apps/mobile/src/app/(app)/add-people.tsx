import { useState } from "react";
import { Alert } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { PeoplePicker } from "~/features/compose/people-picker";
import { sheetIcons } from "~/features/compose/sheet";
import { usePeopleSearch } from "~/features/compose/use-people-search";
import { AccountScope } from "~/features/messaging/account";
import { useSpace, useSpaceActions } from "~/features/messaging/spaces";

function AddPeople({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const { addMembers } = useSpaceActions();
  const { space } = useSpace(spaceId);
  const [members, setMembers] = useState<string[]>([]);
  const search = usePeopleSearch({
    exclude: (space?.members ?? []).map((member) => member.accountId),
    selected: members,
  });

  function toggle(address: string) {
    if (members.includes(address)) {
      setMembers(members.filter((member) => member !== address));
      return;
    }
    setMembers([...members, address]);
    search.clear();
  }

  async function add() {
    try {
      await addMembers.mutateAsync({ members, spaceId });
      router.dismiss();
    } catch {
      Alert.alert("Couldn't Add People", "Try again in a moment.");
    }
  }

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={sheetIcons.done}
          accessibilityLabel="Add to Space"
          variant="prominent"
          disabled={members.length === 0 || addMembers.isPending}
          onPress={() => void add()}
        />
      </Stack.Toolbar>
      <NativeHost style={{ flex: 1 }}>
        <FieldList>
          <PeoplePicker search={search} selected={members} onPress={toggle} />
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
