import { FieldGroup, ListItem, Text } from "@expo/ui";

import { Avatar } from "~/components/avatar";
import { useAccountExists } from "~/features/messaging/directory";
import { secondaryTextStyle } from "~/lib/colors";

/** The account for the typed address, or "No users found". */
export function NewAddressRow({
  address,
  displayName,
  onAdd,
}: {
  address: string;
  displayName: (address: string) => string;
  onAdd: (address: string) => void;
}) {
  const exists = useAccountExists(address);
  if (exists === undefined) return null;
  if (!exists) {
    return (
      <FieldGroup.Section>
        <Text textStyle={secondaryTextStyle}>No users found</Text>
      </FieldGroup.Section>
    );
  }
  return (
    <FieldGroup.Section>
      <ListItem
        leading={
          <Avatar name={displayName(address)} seed={address} size="sm" />
        }
        supportingText={<Text textStyle={secondaryTextStyle}>{address}</Text>}
        onPress={() => onAdd(address)}
      >
        {displayName(address)}
      </ListItem>
    </FieldGroup.Section>
  );
}
