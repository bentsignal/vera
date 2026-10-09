import { useRef, useState } from "react";
import { Alert } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { PeoplePicker } from "~/features/compose/people-picker";
import { sheetIcons, useCloseSheet } from "~/features/compose/sheet";
import { usePeopleSearch } from "~/features/compose/use-people-search";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { newId } from "~/features/messaging/optimistic";
import { useSpaceActions } from "~/features/messaging/spaces";

/** Picks who to invite, then creates the space named on the previous step. */
function NewSpacePeople({ name }: { name: string }) {
  const router = useRouter();
  const closeSheet = useCloseSheet();
  const { address: self } = useAccount();
  const { createSpace, invite } = useSpaceActions();
  const [members, setMembers] = useState<string[]>([]);
  const search = usePeopleSearch({ selected: members });
  // The sheet closes as it creates; a second tap must not make another.
  const created = useRef(false);

  function toggle(address: string) {
    if (members.includes(address)) {
      setMembers(members.filter((member) => member !== address));
      return;
    }
    setMembers([...members, address]);
  }

  /** Creates the space and invites people, and opens it right away. */
  function create() {
    if (created.current) return;
    created.current = true;
    const spaceId = newId("space", self);
    const space = createSpace.mutateAsync({
      generalChannelId: newId("channel", self),
      name,
      spaceId,
    });
    // Sent right after, so it runs once the space exists.
    const invited =
      members.length === 0
        ? Promise.resolve(null)
        : invite.mutateAsync({ members, spaceId });
    void Promise.allSettled([space, invited]).then(([made, people]) => {
      if (made.status === "rejected") {
        Alert.alert("Couldn't Create Space", "Try again in a moment.");
      } else if (people.status === "rejected") {
        // The space exists either way; people can be invited again from it.
        Alert.alert(
          "Couldn't Invite People",
          "The space was created. Invite people from its Members list.",
        );
      }
    });
    closeSheet();
    router.push({
      params: { account: self, name, spaceId },
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
          onPress={create}
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
