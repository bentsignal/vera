import { FieldGroup, Row, Spacer, Text } from "@expo/ui";

import type { ConversationKind } from "~/features/inbox/types";
import type { Appearance, MessageLayout } from "~/features/preferences/store";
import { ChoiceMenu } from "~/components/choice-menu";
import {
  LAYOUT_PREFERENCE,
  setPreference,
  usePreference,
} from "~/features/preferences/store";
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

const CONVERSATION_KINDS = [
  { kind: "direct", label: "One-on-One" },
  { kind: "group", label: "Group Chats" },
  { kind: "channel", label: "Spaces" },
] as const satisfies readonly { kind: ConversationKind; label: string }[];

function LayoutRow({ kind, label }: { kind: ConversationKind; label: string }) {
  const key = LAYOUT_PREFERENCE[kind];
  const layout = usePreference(key);
  return (
    <Row alignment="center" modifiers={fillRow}>
      <Text>{label}</Text>
      <Spacer flexible />
      <ChoiceMenu<MessageLayout>
        value={layout}
        choices={LAYOUTS}
        onChange={(value) => setPreference(key, value)}
      />
    </Row>
  );
}

export function DisplaySection() {
  const appearance = usePreference("appearance");
  return (
    <>
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
      </FieldGroup.Section>
      <FieldGroup.Section title="Message Style">
        {CONVERSATION_KINDS.map(({ kind, label }) => (
          <LayoutRow key={kind} kind={kind} label={label} />
        ))}
      </FieldGroup.Section>
    </>
  );
}
