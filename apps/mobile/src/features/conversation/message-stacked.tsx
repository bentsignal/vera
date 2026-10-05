import { Text, View } from "react-native";

import type { Message } from "./types";
import { Avatar } from "~/components/avatar";
import { cn } from "~/lib/cn";
import { formatTime } from "~/lib/format";
import { AttachmentView } from "./attachment-view";
import { LinkPreviewCard } from "./link-preview-card";
import { InteractiveMessage } from "./message-reactions";
import { MessageMeta, SendingFade } from "./message-status";
import { visibleBody } from "./message-text";

const AVATAR_COLUMN = 36;

/** Slack/Discord-style: everyone left-aligned with a photo and name. */
export function MessageStacked({
  message,
  author,
  startsGroup,
}: {
  message: Message;
  author: { avatarUrl: string | null; displayName: string };
  startsGroup: boolean;
}) {
  const body = visibleBody(message);
  return (
    <View
      className={cn("flex-row gap-3 px-4", startsGroup ? "pt-3" : "pt-0.5")}
    >
      <View style={{ width: AVATAR_COLUMN }}>
        {startsGroup && (
          <Avatar name={author.displayName} size="row" uri={author.avatarUrl} />
        )}
      </View>
      <View className="flex-1 gap-1">
        {startsGroup && (
          <View className="flex-row items-baseline gap-2">
            <Text className="text-subhead text-foreground font-semibold">
              {author.displayName}
            </Text>
            {message.status === undefined && (
              <Text className="text-caption text-muted">
                {formatTime(message.sentAt)}
              </Text>
            )}
          </View>
        )}
        <InteractiveMessage message={message} align="start" shape="card">
          <SendingFade status={message.status}>
            <View className="items-start gap-1">
              {body !== undefined && (
                <Text className="text-body text-foreground">{body}</Text>
              )}
              {message.attachments.map((attachment) => (
                <AttachmentView key={attachment.url} attachment={attachment} />
              ))}
              {message.linkPreview && (
                <LinkPreviewCard preview={message.linkPreview} />
              )}
            </View>
          </SendingFade>
        </InteractiveMessage>
        <MessageMeta message={message} delivered={false} />
      </View>
    </View>
  );
}
