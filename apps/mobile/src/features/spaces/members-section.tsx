import type { Space } from "@decentralized-convex/messages";
import { useRouter } from "expo-router";
import { FieldGroup, ListItem, Text } from "@expo/ui";

import { Avatar } from "~/components/avatar";
import { SectionHeaderWithAdd } from "~/components/section-header";
import { useAccount } from "~/features/messaging/account";
import { useProfiles } from "~/features/messaging/profiles";
import { useOpenProfile } from "~/features/profile/use-open-profile";
import { secondaryTextStyle } from "~/lib/colors";

export function MembersSection({ space }: { space: Space }) {
  const router = useRouter();
  const { address: account } = useAccount();
  const profileOf = useProfiles(
    space.members.map((member) => member.accountId),
  );
  const openProfile = useOpenProfile();
  return (
    <FieldGroup.Section>
      <FieldGroup.SectionHeader>
        <SectionHeaderWithAdd
          title={`Members (${space.members.length})`}
          onAdd={() =>
            router.push({
              params: { account, spaceId: space.spaceId },
              pathname: "/add-people",
            })
          }
        />
      </FieldGroup.SectionHeader>
      {space.members.map((member) => (
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
          onPress={() => openProfile(member.accountId)}
        >
          {profileOf(member.accountId).displayName}
        </ListItem>
      ))}
    </FieldGroup.Section>
  );
}
