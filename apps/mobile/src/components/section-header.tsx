import { Button, Icon, Row, Spacer, Text } from "@expo/ui";

import { linkButton } from "~/lib/ui-modifiers";

const PLUS = Icon.select({
  android: import("@expo/material-symbols/add.xml"),
  ios: "plus",
});

/**
 * Section heading content with a plus button on the right. Wrap it in
 * `FieldGroup.SectionHeader` at the call site: the group finds header slots
 * by their direct child type.
 */
export function SectionHeaderWithAdd({
  title,
  onAdd,
}: {
  title: string;
  onAdd: () => void;
}) {
  return (
    <Row alignment="center">
      <Text>{title}</Text>
      <Spacer />
      <Button modifiers={linkButton} onPress={onAdd}>
        <Icon name={PLUS} size={16} />
      </Button>
    </Row>
  );
}
