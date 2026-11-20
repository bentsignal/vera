import { Alert } from "react-native";
import { FieldGroup } from "@expo/ui";

import { DestructiveButton } from "~/components/destructive-button";
import { useClearBadge } from "~/features/notifications/clear-badge";

/**
 * Clears the app icon badge (see `useClearBadge`), at the bottom of the
 * notification settings, once you've confirmed it.
 */
export function ClearBadgeSection() {
  const clearBadge = useClearBadge();

  function confirm() {
    Alert.alert(
      "Clear the Badge?",
      "Everything it counts is marked as read, on all your devices.",
      [
        { style: "cancel", text: "Cancel" },
        { onPress: clearBadge, style: "destructive", text: "Clear Badge" },
      ],
    );
  }

  return (
    <FieldGroup.Section>
      <DestructiveButton label="Clear Badge" onPress={confirm} />
    </FieldGroup.Section>
  );
}
