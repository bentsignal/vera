import { Text, View } from "react-native";

import type { Message } from "./types";
import { cn } from "~/lib/cn";
import { BUBBLE_RADIUS } from "./bubble-shape";

// What a message shows of being changed after it was sent: edited, or
// deleted while its thread had replies (any other deleted message is gone).

const DELETED_TEXT = "This message was deleted";

/**
 * Where a deleted thread original was, in its bubble's place: an outline
 * of a bubble, so its thread's count under it still has something to
 * belong to.
 */
export function DeletedBubble() {
  return (
    <View
      className="border-separator border px-3.5 py-2"
      style={{ borderCurve: "continuous", borderRadius: BUBBLE_RADIUS }}
    >
      <Text className="text-body text-muted leading-[22px] italic">
        {DELETED_TEXT}
      </Text>
    </View>
  );
}

/** Where a deleted thread original was, in a stacked row. */
export function DeletedText() {
  return <Text className="text-body text-muted italic">{DELETED_TEXT}</Text>;
}

/** "Edited" under an edited bubble, on its side. */
export function EditedLabel({
  message,
  isOwn,
}: {
  message: Message;
  isOwn: boolean;
}) {
  if (message.editedAt === undefined) return null;
  return (
    <Text className={cn("text-caption text-muted px-1", isOwn && "text-right")}>
      Edited
    </Text>
  );
}

/**
 * "(edited)" after an edited message's text in a stacked row, inside the
 * text so it follows its last line.
 */
export function EditedSuffix() {
  return <Text className="text-caption text-muted"> (edited)</Text>;
}
