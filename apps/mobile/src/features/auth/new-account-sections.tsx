import { FieldGroup, Row, Text, TextInput } from "@expo/ui";

import { env } from "~/env";
import { nativeColors } from "~/lib/colors";
import { fillRow, growInRow } from "~/lib/ui-modifiers";

/**
 * Invite code and username fields for creating an account, as two
 * `FieldGroup` sections. Call it as a function inside `<FieldGroup>`, not as
 * a component: on Android, `FieldGroup` only treats direct children (and
 * fragments) as sections, and wraps anything else in one list row that
 * shows just the first section, which hid the username field.
 */
export function newAccountSections({
  onChangeInviteCode,
  onChangeUsername,
}: {
  onChangeInviteCode: (value: string) => void;
  onChangeUsername: (value: string) => void;
}) {
  return (
    <>
      <FieldGroup.Section title="Invite Code">
        <TextInput
          placeholder="Enter your invite code"
          autoCapitalize="characters"
          autoCorrect={false}
          onChangeText={onChangeInviteCode}
        />
        <FieldGroup.SectionFooter>
          <Text>Vera is invite-only for now. Ask a friend for a code.</Text>
        </FieldGroup.SectionFooter>
      </FieldGroup.Section>
      <FieldGroup.Section title="Address">
        <Row alignment="center" spacing={2} modifiers={fillRow}>
          <TextInput
            modifiers={growInRow}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            onChangeText={onChangeUsername}
          />
          <Text
            textStyle={{ color: nativeColors.secondaryLabel }}
          >{`@${env.veraDomain}`}</Text>
        </Row>
        <FieldGroup.SectionFooter>
          <Text>
            Your address is how people find you. It can't be changed later.
          </Text>
        </FieldGroup.SectionFooter>
      </FieldGroup.Section>
    </>
  );
}
