import { useState } from "react";
import { Alert } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, FieldGroup, Row, Spacer, Text } from "@expo/ui";

import type { Expiration } from "~/features/spaces/invite-links";
import { ChoiceMenu } from "~/components/choice-menu";
import { NativeHost } from "~/components/native-host";
import { sheetIcons } from "~/features/compose/sheet";
import { AccountScope } from "~/features/messaging/account";
import { useSpaceActions } from "~/features/messaging/spaces";
import {
  DEFAULT_EXPIRATION,
  describeExpiry,
  EXPIRATIONS,
  inviteLinkUrl,
  shareInviteLink,
} from "~/features/spaces/invite-links";
import { canCopy, copyText } from "~/lib/native-extras";
import { fillRow, linkButton } from "~/lib/ui-modifiers";

/** Picks how long a new link lasts, makes it, then offers to share it. */
function InviteLink({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const { createInviteLink } = useSpaceActions();
  const [expiration, setExpiration] = useState<Expiration>(DEFAULT_EXPIRATION);
  const created = createInviteLink.data;

  function create() {
    const { ms } =
      EXPIRATIONS.find((choice) => choice.value === expiration) ??
      EXPIRATIONS[0];
    createInviteLink.mutate(
      { expiresIn: ms, spaceId },
      {
        onError: () =>
          Alert.alert("Couldn't Create Link", "Try again in a moment."),
        onSuccess: (link) => shareInviteLink(inviteLinkUrl(link.code)),
      },
    );
  }

  if (created !== undefined) {
    const url = inviteLinkUrl(created.code);
    return (
      <>
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon={sheetIcons.done}
            accessibilityLabel="Done"
            variant="prominent"
            onPress={() => router.dismiss()}
          />
        </Stack.Toolbar>
        <NativeHost style={{ flex: 1 }}>
          <FieldGroup>
            <FieldGroup.Section title="Invite Link">
              <Text>{url.replace("https://", "")}</Text>
              <FieldGroup.SectionFooter>
                <Text>{describeExpiry(created.expiresAt)}</Text>
              </FieldGroup.SectionFooter>
            </FieldGroup.Section>
            <FieldGroup.Section>
              <Button
                label="Share Link"
                variant="text"
                modifiers={linkButton}
                onPress={() => shareInviteLink(url)}
              />
              {canCopy && (
                <Button
                  label="Copy Link"
                  variant="text"
                  modifiers={linkButton}
                  onPress={() => copyText(url)}
                />
              )}
            </FieldGroup.Section>
          </FieldGroup>
        </NativeHost>
      </>
    );
  }

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={sheetIcons.done}
          accessibilityLabel="Create Link"
          variant="prominent"
          disabled={createInviteLink.isPending}
          onPress={create}
        />
      </Stack.Toolbar>
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup>
          <FieldGroup.Section>
            <Row alignment="center" modifiers={fillRow}>
              <Text>Expire After</Text>
              <Spacer flexible />
              <ChoiceMenu<Expiration>
                value={expiration}
                choices={EXPIRATIONS}
                onChange={setExpiration}
              />
            </Row>
            <FieldGroup.SectionFooter>
              <Text>
                Anyone with the link can join the space until it expires. You
                can turn it off from the space at any time.
              </Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
        </FieldGroup>
      </NativeHost>
    </>
  );
}

export default function InviteLinkScreen() {
  const { account, spaceId } = useLocalSearchParams<{
    account?: string;
    spaceId: string;
  }>();
  return (
    <AccountScope address={account}>
      <InviteLink spaceId={spaceId} />
    </AccountScope>
  );
}
