import type { SpaceInviteLink } from "@decentralized-convex/messages";
import { useState } from "react";
import { Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, FieldGroup, Row, Spacer, Text } from "@expo/ui";

import type { Expiration } from "~/features/spaces/invite-links";
import { ChoiceMenu } from "~/components/choice-menu";
import { NativeHost } from "~/components/native-host";
import { SelectableText } from "~/components/selectable-text";
import { AccountScope } from "~/features/messaging/account";
import {
  useSpaceActions,
  useSpaceInviteLinks,
} from "~/features/messaging/spaces";
import {
  describeExpiry,
  expirationOf,
  EXPIRATIONS,
  inviteLinkUrl,
  shareInviteLink,
} from "~/features/spaces/invite-links";
import { canCopy, copyText, selectionTick } from "~/lib/native-extras";
import { destructive, fillRow, linkButton } from "~/lib/ui-modifiers";

/** How long the link lasts, saved as soon as it's picked. */
function ExpiryRow({ link }: { link: SpaceInviteLink }) {
  const { setInviteLinkExpiry } = useSpaceActions();
  const saved = expirationOf(link);
  // The choice, and the saved value when it was made.
  const [pending, setPending] = useState<{
    choice: Expiration;
    from: Expiration | undefined;
  } | null>(null);
  // The server has the new value (or another change): follow it again.
  if (pending !== null && saved !== pending.from) setPending(null);
  const shown = pending?.choice ?? saved ?? "7d";

  function change(choice: Expiration) {
    setPending({ choice, from: saved });
    const { ms } =
      EXPIRATIONS.find((option) => option.value === choice) ?? EXPIRATIONS[0];
    setInviteLinkExpiry.mutate(
      { code: link.code, expiresIn: ms },
      {
        onError: () => {
          setPending(null);
          Alert.alert(
            "Couldn't Change It",
            "That much time has already passed since the link was made.",
          );
        },
      },
    );
  }

  return (
    <Row alignment="center" modifiers={fillRow}>
      <Text>Expire After</Text>
      <Spacer flexible />
      <ChoiceMenu<Expiration>
        value={shown}
        choices={EXPIRATIONS}
        onChange={change}
      />
    </Row>
  );
}

/**
 * One invite link, made the moment you asked for it: the link with one-tap
 * Copy and Share, how long it lasts, and Delete. Every action is in the
 * form, so it works in Android's bottom sheet, which has no toolbar.
 */
function InviteLink({ code, spaceId }: { code: string; spaceId: string }) {
  const router = useRouter();
  const { revokeInviteLink } = useSpaceActions();
  const { isLoading, links } = useSpaceInviteLinks(spaceId);
  const [copied, setCopied] = useState(false);
  const link = links.find((candidate) => candidate.code === code);
  const url = inviteLinkUrl(code);

  if (link === undefined) {
    if (isLoading) return null;
    return (
      <NativeHost style={{ flex: 1 }}>
        <FieldGroup>
          <FieldGroup.Section>
            <Text>This invite link was deleted or has expired.</Text>
          </FieldGroup.Section>
        </FieldGroup>
      </NativeHost>
    );
  }

  return (
    <NativeHost style={{ flex: 1 }}>
      <FieldGroup>
        <FieldGroup.Section title="Invite Link">
          <SelectableText>{url}</SelectableText>
          {canCopy && (
            <Button
              label={copied ? "Copied" : "Copy Link"}
              variant="text"
              modifiers={linkButton}
              onPress={() => {
                copyText(url);
                selectionTick();
                setCopied(true);
                // Back to "Copy Link" so it can be copied again.
                setTimeout(() => setCopied(false), 2000);
              }}
            />
          )}
          <Button
            label="Share Link"
            variant="text"
            modifiers={linkButton}
            onPress={() => shareInviteLink(url)}
          />
          <FieldGroup.SectionFooter>
            <Text>
              Anyone with the link can join the space until it expires.
            </Text>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>
        <FieldGroup.Section>
          <ExpiryRow link={link} />
          <FieldGroup.SectionFooter>
            <Text>{describeExpiry(link.expiresAt)}</Text>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>
        <FieldGroup.Section>
          <Button
            label="Delete Invite Link"
            variant="text"
            modifiers={destructive}
            onPress={() =>
              Alert.alert(
                "Delete Invite Link?",
                "Anyone who has it won't be able to join with it.",
                [
                  { style: "cancel", text: "Cancel" },
                  {
                    onPress: () => {
                      revokeInviteLink.mutate({ code });
                      router.back();
                    },
                    style: "destructive",
                    text: "Delete",
                  },
                ],
              )
            }
          />
        </FieldGroup.Section>
      </FieldGroup>
    </NativeHost>
  );
}

export default function InviteLinkScreen() {
  const { account, code, spaceId } = useLocalSearchParams<{
    account?: string;
    code: string;
    spaceId: string;
  }>();
  return (
    <AccountScope address={account}>
      <InviteLink code={code} spaceId={spaceId} />
    </AccountScope>
  );
}
