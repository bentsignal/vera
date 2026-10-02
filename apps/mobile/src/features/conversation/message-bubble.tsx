import { Text, View } from "react-native";

import type { Message } from "./types";
import { cn } from "~/lib/cn";
import { AttachmentView } from "./attachment-view";
import { LinkPreviewCard } from "./link-preview-card";
import { MessageMeta, SendingFade } from "./message-status";

function Body({ text, isOwn }: { text: string; isOwn: boolean }) {
  return (
    <View
      className={cn(
        "rounded-[18px] px-3.5 py-2",
        isOwn ? "bg-bubble-outgoing" : "bg-bubble-incoming",
      )}
      style={{ borderCurve: "continuous" }}
    >
      <Text
        selectable
        className={cn(
          "text-body",
          isOwn ? "text-on-accent" : "text-foreground",
        )}
      >
        {text}
      </Text>
    </View>
  );
}

/** iMessage-style: your messages on the right, everyone else's on the left. */
export function MessageBubble({
  message,
  isOwn,
  authorName,
  startsGroup,
  endsGroup,
}: {
  message: Message;
  isOwn: boolean;
  /** Shown above the first message of a group in multi-person chats. */
  authorName?: string;
  startsGroup: boolean;
  endsGroup: boolean;
}) {
  return (
    <View
      className={cn(
        "max-w-[80%] gap-1 px-3",
        isOwn ? "items-end self-end" : "items-start self-start",
        startsGroup ? "pt-2" : "pt-0.5",
      )}
    >
      {startsGroup && authorName && (
        <Text className="text-caption text-muted px-3">{authorName}</Text>
      )}
      <SendingFade status={message.status}>
        <View className={cn("gap-1", isOwn ? "items-end" : "items-start")}>
          {message.attachments.map((attachment) => (
            <AttachmentView key={attachment.url} attachment={attachment} />
          ))}
          {message.body && <Body text={message.body} isOwn={isOwn} />}
          {message.linkPreview && (
            <LinkPreviewCard preview={message.linkPreview} />
          )}
        </View>
      </SendingFade>
      <MessageMeta
        message={message}
        showTime={endsGroup}
        align={isOwn ? "end" : "start"}
      />
    </View>
  );
}
