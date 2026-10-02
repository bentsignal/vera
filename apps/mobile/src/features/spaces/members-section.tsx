import type { Space } from "@decentralized-convex/messages";
import { useRouter } from "expo-router";
import { FieldGroup, ListItem, Text } from "@expo/ui";

import { Avatar } from "~/components/avatar";
import { SectionHeaderWithAdd } from "~/components/section-header";
import { useAccount } from "~/features/messaging/account";
import { useDisplayNames } from "~/features/messaging/profiles";
import { secondaryTextStyle } from "~/lib/colors";

export function MembersSection({ space }: { space: Space }) {
  const router = useRouter();
  const { address: account } = useAccount();
  const displayName = useDisplayNames(
    space.members.map((member) => member.accountId),
  );
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
          leading={<Avatar name={displayName(member.accountId)} size="sm" />}
          supportingText={
            <Text textStyle={secondaryTextStyle}>
              {member.role === "owner"
                ? `${member.accountId} · Owner`
                : member.accountId}
            </Text>
          }
        >
          {displayName(member.accountId)}
        </ListItem>
      ))}
    </FieldGroup.Section>
  );
}
