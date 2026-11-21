import type { Space } from "@decentralized-convex/messages";
import { useRouter } from "expo-router";
import { Button, FieldGroup, Text } from "@expo/ui";

import { Avatar } from "~/components/avatar";
import { ListItem } from "~/components/list-item";
import { SectionHeaderWithAdd } from "~/components/section-header";
import { useAccount } from "~/features/messaging/account";
import { useProfiles } from "~/features/messaging/profiles";
import { memberCount, useSpaceMembers } from "~/features/messaging/spaces";
import { useOpenProfile } from "~/features/profile/use-open-profile";
import { secondaryTextStyle } from "~/lib/colors";
import { linkButton } from "~/lib/ui-modifiers";
import { useMemberPress } from "./member-press";

export function MembersSection({ space }: { space: Space }) {
  const router = useRouter();
  const { address: account } = useAccount();
  const { hasMore, loadMore, members } = useSpaceMembers(space);
  const invited = space.invited ?? [];
  const profileOf = useProfiles([
    ...members.map((member) => member.accountId),
    ...invited,
  ]);
  const openProfile = useOpenProfile();
  const onMemberPress = useMemberPress(space, openProfile);

  return (
    <FieldGroup.Section>
      <FieldGroup.SectionHeader>
        <SectionHeaderWithAdd
          title={`Members (${memberCount(members.length, hasMore)})`}
          onAdd={() =>
            router.push({
              params: { account, spaceId: space.spaceId },
              pathname: "/add-people",
            })
          }
        />
      </FieldGroup.SectionHeader>
      {members.map((member) => (
        <ListItem
          key={member.accountId}
          leading={
            <Avatar
              name={profileOf(member.accountId).displayName}
              size="sm"
              uri={profileOf(member.accountId).avatarUrl}
            />
          }
          supportingText={
            <Text textStyle={secondaryTextStyle}>
              {member.role === "owner"
                ? `${member.accountId} · Owner`
                : member.accountId}
            </Text>
          }
          onPress={() => onMemberPress(member)}
        >
          {profileOf(member.accountId).displayName}
        </ListItem>
      ))}
      {hasMore && (
        <Button
          label="Show More"
          variant="text"
          modifiers={linkButton}
          onPress={loadMore}
        />
      )}
      {invited.map((address) => (
        <ListItem
          key={address}
          leading={
            <Avatar
              name={profileOf(address).displayName}
              size="sm"
              uri={profileOf(address).avatarUrl}
            />
          }
          supportingText={
            <Text textStyle={secondaryTextStyle}>{`${address} · Invited`}</Text>
          }
          onPress={() => openProfile(address)}
        >
          {profileOf(address).displayName}
        </ListItem>
      ))}
    </FieldGroup.Section>
  );
}
