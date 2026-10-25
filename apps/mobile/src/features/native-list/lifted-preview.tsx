import { View } from "react-native";
import { Image } from "expo-image";

import type { HeldPart } from "./held-part";
import type { Message } from "~/features/conversation/types";
import type { MessageLayout } from "~/features/preferences/store";
import { AttachmentView } from "~/features/conversation/attachment-view";
import { BubbleBody } from "~/features/conversation/bubble-body";
import { LinkCardView } from "~/features/conversation/link-preview-card";
import { LinkedText } from "~/features/conversation/linked-text";
import { linkCardsOf, visibleBody } from "~/features/conversation/message-text";

/**
 * A photo or video as the native list draws it, filling the frame it
 * reported: whatever its place in a group, the copy lifts from there.
 */
function MediaCopy({ uri }: { uri: string | undefined }) {
  return (
    <View
      className="bg-fill flex-1 overflow-hidden rounded-2xl"
      style={{ borderCurve: "continuous" }}
    >
      {uri !== undefined && (
        <Image
          source={{ uri }}
          contentFit="cover"
          style={{ height: "100%", width: "100%" }}
        />
      )}
    </View>
  );
}

/**
 * The React copy of a held part of a message that the glass menu lifts
 * over the native list, which hides its own (`liftedRowId`).
 */
export function LiftedPreview({
  message,
  held,
  layout,
  isOwn,
}: {
  message: Message;
  held: HeldPart;
  layout: MessageLayout;
  isOwn: boolean;
}) {
  const { attachment, link } = held;
  if (attachment?.kind === "file") {
    return <AttachmentView attachment={attachment} />;
  }
  if (attachment !== undefined) {
    const poster =
      attachment.kind === "video"
        ? (attachment.localThumbnailUrl ?? attachment.thumbnailUrl)
        : (attachment.localUrl ?? attachment.url);
    return <MediaCopy uri={poster} />;
  }
  const card = linkCardsOf(message).find((each) => each.link === link);
  if (card !== undefined) return <LinkCardView card={card} />;
  const body = visibleBody(message) ?? "";
  if (layout === "stacked") {
    return (
      <LinkedText
        text={body}
        mentions={message.mentions}
        className="text-body text-foreground"
      />
    );
  }
  return (
    <BubbleBody
      text={body}
      mentions={message.mentions}
      isOwn={isOwn}
      tail={false}
    />
  );
}
