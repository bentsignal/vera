import { useState } from "react";
import { Alert, Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import { directConversationId } from "@decentralized-convex/messages";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { SegmentedSection } from "~/components/segmented-section";
import { useDismissKeyboardOnDrag } from "~/features/compose/dismiss-keyboard-on-drag";
import { FromSection, useFromAccount } from "~/features/compose/from-section";
import { useGroupMembers } from "~/features/compose/group-members";
import { PeoplePicker } from "~/features/compose/people-picker";
import { sheetIcons, useCloseSheet } from "~/features/compose/sheet";
import { usePeopleSearch } from "~/features/compose/use-people-search";
import { AccountScope } from "~/features/messaging/account";
import { useConversationActions } from "~/features/messaging/conversations";
import { dismissKeyboardOnScroll } from "~/lib/ui-modifiers";

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
  // Shared with the name step, which can remove people again.
  const [members, setMembers] = useGroupMembers();
  const dragDismiss = useDismissKeyboardOnDrag();
  const { openDirect } = useConversationActions();
  const isGroup = mode === "Group";
  // Chat lists everyone; Group lists the people picked on their own.
  const search = usePeopleSearch({ selected: isGroup ? members : [] });

  // Opens the conversation with one person (an existing DM if there is
  // one) right away: its ID comes from the two addresses.
  function message(address: string) {
    void openDirect
      .mutateAsync({ accountId: address })
      .catch(() =>
        Alert.alert("Couldn't Start Conversation", "Try again in a moment."),
      );
    closeSheet();
    router.push({
      params: {
        account: from,
        conversationId: directConversationId(from, address.toLowerCase()),
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
              params: { account: from },
              pathname: "/new-message/group",
            })
          }
        />
      )}
      <NativeHost style={{ flex: 1 }} {...dragDismiss}>
        <FieldList modifiers={dismissKeyboardOnScroll}>
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
  const [, setMembers] = useGroupMembers();
  return (
    // Changing accounts starts the message over.
    <AccountScope key={from} address={from}>
      <NewMessage
        from={from}
        onChangeFrom={(address) => {
          setMembers([]);
          setFrom(address);
        }}
      />
    </AccountScope>
  );
}
