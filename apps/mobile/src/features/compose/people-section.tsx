import { FieldGroup, ListItem, Text } from "@expo/ui";

import { Avatar } from "~/components/avatar";
import { secondaryTextStyle } from "~/lib/colors";

/** A titled list of people; tapping one calls `onPress`. */
export function PeopleSection({
  title,
  addresses,
  displayName,
  onPress,
}: {
  title?: string;
  addresses: string[];
  displayName: (address: string) => string;
  onPress: (address: string) => void;
}) {
  if (addresses.length === 0) return null;
  return (
    <FieldGroup.Section title={title}>
      {addresses.map((address) => (
        <ListItem
          key={address}
          leading={
            <Avatar name={displayName(address)} seed={address} size="sm" />
          }
          supportingText={<Text textStyle={secondaryTextStyle}>{address}</Text>}
          onPress={() => onPress(address)}
        >
          {displayName(address)}
        </ListItem>
      ))}
    </FieldGroup.Section>
  );
}
