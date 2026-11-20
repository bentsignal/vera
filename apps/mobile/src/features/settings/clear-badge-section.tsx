import { Alert } from "react-native";
import { FieldGroup } from "@expo/ui";

import { DestructiveButton } from "~/components/destructive-button";
import { useClearBadge } from "~/features/notifications/clear-badge";

/**
 * Mark All as Read, at the bottom of the notification settings: clears
 * the app icon badge (see `useClearBadge`) once you've confirmed it.
 */
export function ClearBadgeSection() {
  const clearBadge = useClearBadge();

  function confirm() {
    Alert.alert(
      "Mark All as Read?",
      "Everything unread is marked as read, on all your devices.",
      [
        { style: "cancel", text: "Cancel" },
        { onPress: clearBadge, style: "destructive", text: "Mark All as Read" },
      ],
    );
  }

  return (
    <FieldGroup.Section>
      <DestructiveButton label="Mark All as Read" onPress={confirm} />
    </FieldGroup.Section>
  );
}
