import type { Space, SpaceInviteLink } from "@decentralized-convex/messages";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { FieldGroup, Text } from "@expo/ui";

import { ListItem } from "~/components/list-item";
import { SymbolIcon } from "~/components/symbol-icon";
import { useAccount } from "~/features/messaging/account";
import { useProfiles } from "~/features/messaging/profiles";
import { useSpaceActions } from "~/features/messaging/spaces";
import { secondaryTextStyle } from "~/lib/colors";
import {
  DEFAULT_EXPIRATION,
  describeExpiry,
  EXPIRATIONS,
  inviteLinkUrl,
} from "./invite-links";

const LINK_ICON = { android: "link", ios: "link" } as const;

/**
 * The space's live invite links (owners see everyone's, members their
 * own), under a row that makes one. Tapping a link opens it to copy,
 * share, change how long it lasts, or delete it.
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
  const { createInviteLink } = useSpaceActions();
  const profileOf = useProfiles(links.map((link) => link.createdBy));

  function open(code: string) {
    router.push({
      params: { account, code, spaceId: space.spaceId },
      pathname: "/invite-link",
    });
  }

  /** Makes a link right away (it lasts a week until changed) and opens it. */
  function create() {
    const { ms } =
      EXPIRATIONS.find((choice) => choice.value === DEFAULT_EXPIRATION) ??
      EXPIRATIONS[0];
    createInviteLink.mutate(
      { expiresIn: ms, spaceId: space.spaceId },
      {
        onError: () =>
          Alert.alert("Couldn't Create Link", "Try again in a moment."),
        onSuccess: (link) => open(link.code),
      },
    );
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
        onPress={() => {
          if (!createInviteLink.isPending) create();
        }}
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
          onPress={() => open(link.code)}
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
