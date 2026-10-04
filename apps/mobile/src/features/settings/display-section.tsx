import { FieldGroup, Row, Spacer, Text } from "@expo/ui";

import type { Appearance, MessageLayout } from "~/features/preferences/store";
import { ChoiceMenu } from "~/components/choice-menu";
import { setPreference, usePreference } from "~/features/preferences/store";
import { fillRow } from "~/lib/ui-modifiers";

const APPEARANCES = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
] as const satisfies readonly { label: string; value: Appearance }[];

const LAYOUTS = [
  { label: "Bubbles", value: "bubbles" },
  { label: "Stacked", value: "stacked" },
] as const satisfies readonly { label: string; value: MessageLayout }[];

export function DisplaySection() {
  const appearance = usePreference("appearance");
  const layout = usePreference("messageLayout");
  return (
    <FieldGroup.Section title="Display">
      <Row alignment="center" modifiers={fillRow}>
        <Text>Appearance</Text>
        <Spacer flexible />
        <ChoiceMenu<Appearance>
          value={appearance}
          choices={APPEARANCES}
          onChange={(value) => setPreference("appearance", value)}
        />
      </Row>
      <Row alignment="center" modifiers={fillRow}>
        <Text>Messages</Text>
        <Spacer flexible />
        <ChoiceMenu<MessageLayout>
          value={layout}
          choices={LAYOUTS}
          onChange={(value) => setPreference("messageLayout", value)}
        />
      </Row>
    </FieldGroup.Section>
  );
}
