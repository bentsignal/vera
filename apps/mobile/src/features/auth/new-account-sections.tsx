import { FieldGroup, Row, Text, TextInput } from "@expo/ui";

import { env } from "~/env";
import { nativeColors } from "~/lib/colors";

/** Invite code and username fields for creating an account. */
export function NewAccountSections({
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
        <Row alignment="center" spacing={2}>
          <TextInput
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
