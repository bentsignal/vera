import { Button, FieldGroup, ListItem, Text } from "@expo/ui";

import { Avatar } from "~/components/avatar";
import { secondaryTextStyle } from "~/lib/colors";
import { linkButton } from "~/lib/ui-modifiers";

export function ProfileSection({
  displayName,
  address,
  avatarUrl,
  onChangePhoto,
}: {
  displayName: string;
  address: string;
  avatarUrl: string | null;
  onChangePhoto: () => void;
}) {
  return (
    <FieldGroup.Section>
      <ListItem
        leading={
          <Avatar name={displayName} seed={address} size="lg" uri={avatarUrl} />
        }
        supportingText={<Text textStyle={secondaryTextStyle}>{address}</Text>}
        onPress={onChangePhoto}
      >
        <Text textStyle={{ fontSize: 22, fontWeight: "600" }}>
          {displayName}
        </Text>
      </ListItem>
      <Button
        label="Change Photo"
        variant="text"
        modifiers={linkButton}
        onPress={onChangePhoto}
      />
    </FieldGroup.Section>
  );
}
