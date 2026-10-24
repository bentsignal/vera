import { Alert } from "react-native";

import { deleteOutgoing, retryOutgoing } from "~/features/messaging/outbox";

/** Asks whether to try a message that failed again, or delete it. */
export function showNotSent(messageId: string) {
  Alert.alert(
    "Message Not Sent",
    undefined,
    [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => deleteOutgoing(messageId),
        style: "destructive",
        text: "Delete",
      },
      { onPress: () => retryOutgoing(messageId), text: "Try Again" },
    ],
    { cancelable: true },
  );
}
