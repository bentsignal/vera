import type { Space } from "@decentralized-convex/messages";
import { useRouter } from "expo-router";
import { Button, FieldGroup, ListItem, Text } from "@expo/ui";

import { Avatar } from "~/components/avatar";
import { useDisplayNames } from "~/features/messaging/profiles";
import { secondaryTextStyle } from "~/lib/colors";

export function MembersSection({ space }: { space: Space }) {
  const router = useRouter();
  const displayName = useDisplayNames(
    space.members.map((member) => member.accountId),
  );
  return (
    <FieldGroup.Section title={`Members (${space.members.length})`}>
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
      <Button
        onPress={() =>
          router.push({
            params: { spaceId: space.spaceId },
            pathname: "/add-people",
          })
        }
      >
        <Text>Add People</Text>
      </Button>
    </FieldGroup.Section>
  );
}
