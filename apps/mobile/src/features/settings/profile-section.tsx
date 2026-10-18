import { View } from "react-native";
import { FieldGroup, Text } from "@expo/ui";

import { Avatar } from "~/components/avatar";
import { ListItem } from "~/components/list-item";
import { SymbolIcon } from "~/components/symbol-icon";
import { secondaryTextStyle } from "~/lib/colors";

/**
 * The account's photo, name, and address. Tapping it changes the photo,
 * which the camera badge on the photo says.
 */
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
          <View accessibilityHint="Changes your photo" className="size-20">
            <Avatar name={displayName} size="lg" uri={avatarUrl} />
            <View className="border-background-elevated bg-accent absolute right-0 bottom-0 size-7 items-center justify-center rounded-full border-2">
              <SymbolIcon
                name={{ android: "photo_camera", ios: "camera.fill" }}
                size={13}
                tintColor="#ffffff"
              />
            </View>
          </View>
        }
        supportingText={<Text textStyle={secondaryTextStyle}>{address}</Text>}
        onPress={onChangePhoto}
      >
        <Text textStyle={{ fontSize: 22, fontWeight: "600" }}>
          {displayName}
        </Text>
      </ListItem>
    </FieldGroup.Section>
  );
}
