import type { Space, SpaceInviteLink } from "@decentralized-convex/messages";
import { useRouter } from "expo-router";
import { FieldGroup, ListItem, Text } from "@expo/ui";

import { showActionSheet } from "~/components/action-sheet";
import { SymbolIcon } from "~/components/symbol-icon";
import { useAccount } from "~/features/messaging/account";
import { useProfiles } from "~/features/messaging/profiles";
import { useSpaceActions } from "~/features/messaging/spaces";
import { secondaryTextStyle } from "~/lib/colors";
import { canCopy, copyText } from "~/lib/native-extras";
import { describeExpiry, inviteLinkUrl, shareInviteLink } from "./invite-links";

const LINK_ICON = { android: "link", ios: "link" } as const;

/**
 * The space's live invite links (owners see everyone's, members their
 * own), each with share, copy, and turn off, under a row that makes one.
 */
export function InviteLinksSection({
  links,
  space,
}: {
  links: readonly SpaceInviteLink[];
  space: Space;
}) {
  const router = useRouter();
  const { address: account } = useAccount();
  const { revokeInviteLink } = useSpaceActions();
  const profileOf = useProfiles(links.map((link) => link.createdBy));

  function manage(code: string) {
    const url = inviteLinkUrl(code);
    showActionSheet([
      { label: "Share Link", onPress: () => shareInviteLink(url) },
      ...(canCopy
        ? [{ label: "Copy Link", onPress: () => copyText(url) }]
        : []),
      {
        destructive: true,
        label: "Turn Off Link",
        onPress: () => revokeInviteLink.mutate({ code }),
      },
    ]);
  }

  return (
    <FieldGroup.Section title="Invite Links">
      <ListItem
        leading={
          <SymbolIcon
            name={{ android: "add_link", ios: "link.badge.plus" }}
            size={20}
            tintColorClassName="accent-accent"
          />
        }
        onPress={() =>
          router.push({
            params: { account, spaceId: space.spaceId },
            pathname: "/invite-link",
          })
        }
      >
        Create Invite Link
      </ListItem>
      {links.map((link) => (
        <ListItem
          key={link.code}
          leading={
            <SymbolIcon
              name={LINK_ICON}
              size={20}
              tintColorClassName="accent-muted"
            />
          }
          supportingText={
            <Text textStyle={secondaryTextStyle}>
              {[
                describeExpiry(link.expiresAt),
                ...(link.createdBy === account
                  ? []
                  : [`by ${profileOf(link.createdBy).displayName}`]),
              ].join(" · ")}
            </Text>
          }
          onPress={() => manage(link.code)}
        >
          {inviteLinkUrl(link.code).replace("https://", "")}
        </ListItem>
      ))}
      <FieldGroup.SectionFooter>
        <Text>Anyone with a link can join the space until it expires.</Text>
      </FieldGroup.SectionFooter>
    </FieldGroup.Section>
  );
}
