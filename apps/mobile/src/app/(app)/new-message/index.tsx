import { useState } from "react";
import { Alert, Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { pdsMutation } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { SegmentedSection } from "~/components/segmented-section";
import { FromSection, useFromAccount } from "~/features/compose/from-section";
import { PeoplePicker } from "~/features/compose/people-picker";
import { sheetIcons, useCloseSheet } from "~/features/compose/sheet";
import { usePeopleSearch } from "~/features/compose/use-people-search";
import { AccountScope } from "~/features/messaging/account";

const MODES = ["Chat", "Group"] as const;

/** Next, to name the group, shown in Group mode. */
function NextToolbar({
  disabled,
  hidden,
  onPress,
}: {
  disabled: boolean;
  hidden: boolean;
  onPress: () => void;
}) {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button
        hidden={hidden}
        icon={sheetIcons.next}
        accessibilityLabel="Next"
        variant="prominent"
        disabled={disabled}
        onPress={onPress}
      >
        Next
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}

function NewMessage({
  from,
  onChangeFrom,
}: {
  from: string;
  onChangeFrom: (address: string) => void;
}) {
  const router = useRouter();
  const closeSheet = useCloseSheet();
  const [mode, setMode] = useState<(typeof MODES)[number]>("Chat");
  const [members, setMembers] = useState<string[]>([]);
  const openDirect = useMutation(
    pdsMutation({ mutation: pds.messages.openDirect, session: from }),
  );
  const isGroup = mode === "Group";
  // Chat lists everyone; Group lists the people picked on their own.
  const search = usePeopleSearch({ selected: isGroup ? members : [] });

  // Opens the conversation with one person (an existing DM if there is one).
  async function message(address: string) {
    if (openDirect.isPending) return;
    const opened = await openDirect
      .mutateAsync({ accountId: address })
      .catch(() => null);
    if (opened === null) {
      Alert.alert("Couldn't Start Conversation", "Try again in a moment.");
      return;
    }
    closeSheet();
    router.push({
      params: {
        account: from,
        conversationId: opened.conversationId,
        title: search.profileOf(address).displayName,
      },
      pathname: "/conversation/[conversationId]",
    });
  }

  function toggle(address: string) {
    if (members.includes(address)) {
      setMembers(members.filter((member) => member !== address));
      return;
    }
    setMembers([...members, address]);
  }

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          icon={sheetIcons.close}
          accessibilityLabel="Close"
          onPress={closeSheet}
        />
      </Stack.Toolbar>
      {/* Android animates a hidden button back in by growing the header's
          Compose host frame by frame, which janks; there the toolbar just
          mounts with Group. iOS fades it in natively. */}
      {(Platform.OS === "ios" || isGroup) && (
        <NextToolbar
          disabled={members.length === 0}
          hidden={!isGroup}
          onPress={() =>
            router.push({
              params: { account: from, members: members.join(",") },
              pathname: "/new-message/group",
            })
          }
        />
      )}
      <NativeHost style={{ flex: 1 }}>
        <FieldList>
          <SegmentedSection values={MODES} value={mode} onChange={setMode} />
          <FromSection from={from} onChange={onChangeFrom} />
          <PeoplePicker
            search={search}
            selected={isGroup ? members : undefined}
            onPress={(address) =>
              isGroup ? toggle(address) : void message(address)
            }
          />
        </FieldList>
      </NativeHost>
    </>
  );
}

export default function NewMessageScreen() {
  const { from, setFrom } = useFromAccount();
  return (
    // Changing accounts starts the message over.
    <AccountScope key={from} address={from}>
      <NewMessage from={from} onChangeFrom={setFrom} />
    </AccountScope>
  );
}
