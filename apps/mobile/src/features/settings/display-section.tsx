import { FieldGroup, Picker, Row, Spacer, Text } from "@expo/ui";

import type { Appearance, MessageLayout } from "~/features/preferences/store";
import { setPreference, usePreference } from "~/features/preferences/store";
import { fillRow } from "~/lib/ui-modifiers";

export function DisplaySection() {
  const appearance = usePreference("appearance");
  const layout = usePreference("messageLayout");
  return (
    <FieldGroup.Section title="Display">
      <Row alignment="center" modifiers={fillRow}>
        <Text>Appearance</Text>
        <Spacer flexible />
        <Picker
          selectedValue={appearance}
          onValueChange={(value: Appearance) =>
            setPreference("appearance", value)
          }
        >
          <Picker.Item label="System" value="system" />
          <Picker.Item label="Light" value="light" />
          <Picker.Item label="Dark" value="dark" />
        </Picker>
      </Row>
      <Row alignment="center" modifiers={fillRow}>
        <Text>Messages</Text>
        <Spacer flexible />
        <Picker
          selectedValue={layout}
          onValueChange={(value: MessageLayout) =>
            setPreference("messageLayout", value)
          }
        >
          <Picker.Item label="Bubbles" value="bubbles" />
          <Picker.Item label="Stacked" value="stacked" />
        </Picker>
      </Row>
    </FieldGroup.Section>
  );
}
