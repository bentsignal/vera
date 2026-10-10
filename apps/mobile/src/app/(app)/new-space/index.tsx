import { useState } from "react";
import { Stack, useRouter } from "expo-router";
import { FieldGroup, Text, TextInput } from "@expo/ui";

import { FieldList } from "~/components/field-list";
import { NativeHost } from "~/components/native-host";
import { useDismissKeyboardOnDrag } from "~/features/compose/dismiss-keyboard-on-drag";
import { FromSection, useFromAccount } from "~/features/compose/from-section";
import { sheetIcons, useCloseSheet } from "~/features/compose/sheet";
import { dismissKeyboardOnScroll } from "~/lib/ui-modifiers";

export default function NewSpaceScreen() {
  const router = useRouter();
  const dragDismiss = useDismissKeyboardOnDrag();
  const closeSheet = useCloseSheet();
  const { from, setFrom } = useFromAccount();
  const [name, setName] = useState("");

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          icon={sheetIcons.close}
          accessibilityLabel="Close"
          onPress={closeSheet}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={sheetIcons.next}
          accessibilityLabel="Next"
          variant="prominent"
          disabled={name.trim().length === 0}
          onPress={() =>
            router.push({
              params: { account: from, name: name.trim() },
              pathname: "/new-space/people",
            })
          }
        >
          Next
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <NativeHost style={{ flex: 1 }} {...dragDismiss}>
        <FieldList modifiers={dismissKeyboardOnScroll}>
          <FromSection from={from} onChange={setFrom} />
          <FieldGroup.Section title="Name">
            <TextInput
              autoFocus
              placeholder="Space name"
              onChangeText={setName}
            />
            <FieldGroup.SectionFooter>
              <Text>Spaces start with a #general channel.</Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
        </FieldList>
      </NativeHost>
    </>
  );
}
