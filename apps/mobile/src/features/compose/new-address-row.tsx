import { FieldGroup, ListItem, Text } from "@expo/ui";

import { Avatar } from "~/components/avatar";
import { useAccountExists } from "~/features/messaging/directory";
import { secondaryTextStyle } from "~/lib/colors";

/** The address being typed, once it is complete enough to look up. */
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
  return (
    <FieldGroup.Section>
      <ListItem
        leading={<Avatar name={address} size="sm" />}
        supportingText={
          <Text textStyle={secondaryTextStyle}>
            {exists === false ? "No Vera account" : address}
          </Text>
        }
        onPress={exists === true ? () => onAdd(address) : undefined}
      >
        {exists === true ? displayName(address) : address}
      </ListItem>
    </FieldGroup.Section>
  );
}
