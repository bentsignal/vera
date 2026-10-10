import type { TextInputRef } from "@expo/ui";
import type { RefObject } from "react";
import { FieldGroup, RNHostView, Row, Text } from "@expo/ui";

import { TextInput } from "~/components/text-input";
import { env } from "~/env";
import { nativeColors } from "~/lib/colors";
import { fillRow, growInRow } from "~/lib/ui-modifiers";
import { InviteCodeInput } from "./invite-code-input";

/**
 * Invite code and username fields for creating an account, as two
 * `FieldGroup` sections. Call it as a function inside `<FieldGroup>`, not as
 * a component: on Android, `FieldGroup` only treats direct children (and
 * fragments) as sections, and wraps anything else in one list row that
 * shows just the first section, which hid the username field.
 *
 * A complete invite code moves the cursor on to the username field, which
 * `usernameRef` points at. The username field has no AutoFill type: a
 * username type made iOS show its passwords bar there but not over the
 * invite code, and the keyboard changed height between the two.
 */
export function newAccountSections({
  inviteCode,
  onChangeInviteCode,
  onChangeUsername,
  usernameRef,
}: {
  inviteCode: string;
  onChangeInviteCode: (value: string) => void;
  onChangeUsername: (value: string) => void;
  usernameRef: RefObject<TextInputRef | null>;
}) {
  return (
    <>
      <FieldGroup.Section title="Invite Code">
        <RNHostView matchContents>
          <InviteCodeInput
            value={inviteCode}
            onChangeText={onChangeInviteCode}
            onComplete={() => usernameRef.current?.focus()}
          />
        </RNHostView>
        <FieldGroup.SectionFooter>
          <Text>Vera is invite-only for now. Ask a friend for a code.</Text>
        </FieldGroup.SectionFooter>
      </FieldGroup.Section>
      <FieldGroup.Section title="Address">
        <Row alignment="center" spacing={2} modifiers={fillRow}>
          <TextInput
            ref={usernameRef}
            modifiers={growInRow}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
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
