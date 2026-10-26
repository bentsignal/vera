import { Alert } from "react-native";

import type { AttachmentUpload } from "./types";
import { removeOutgoingItem, retryOutgoing } from "~/features/messaging/outbox";

/** Retry or remove an attachment that didn't upload. */
export function showUploadProblem({
  itemId,
  messageId,
  state,
}: AttachmentUpload) {
  const remove = {
    onPress: () => removeOutgoingItem(messageId, itemId),
    style: "destructive" as const,
    text: "Remove",
  };
  const cancel = { style: "cancel" as const, text: "Cancel" };
  if (state === "too-large") {
    Alert.alert(
      "Too Big to Send",
      "Remove it to send the rest of the message.",
      [cancel, remove],
      { cancelable: true },
    );
    return;
  }
  Alert.alert(
    "Couldn't Upload",
    "Check your connection and try again.",
    [
      cancel,
      remove,
      { onPress: () => retryOutgoing(messageId), text: "Try Again" },
    ],
    { cancelable: true },
  );
}
