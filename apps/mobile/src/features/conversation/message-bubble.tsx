import { Text, View } from "react-native";

import type { Message } from "./types";
import { Avatar } from "~/components/avatar";
import { cn } from "~/lib/cn";
import { AttachmentView } from "./attachment-view";
import { LinkPreviewCard } from "./link-preview-card";
import { MessageMeta, SendingFade } from "./message-status";
import { RevealedTime, SlideWithReveal } from "./reveal";

/** Width of the avatar column beside incoming bubbles in group chats. */
const AVATAR_COLUMN = 28;
/** The sender's name above a run, plus the gap under it. */
const NAME_HEIGHT = 18;

/**
 * The iMessage tail: a bubble-colored corner, then a page-colored curve
 * that carves it into a hook. Drawn on the last bubble of a run.
 */
function Tail({ isOwn }: { isOwn: boolean }) {
  return (
    <>
      <View
        className={cn(
          "absolute bottom-0 h-5 w-5",
          isOwn
            ? "bg-bubble-outgoing -right-[7px] rounded-bl-[16px]"
            : "bg-bubble-incoming -left-[7px] rounded-br-[16px]",
        )}
      />
      <View
        className={cn(
          "bg-background absolute bottom-0 h-5 w-[10px]",
          isOwn
            ? "-right-[10px] rounded-bl-[10px]"
            : "-left-[10px] rounded-br-[10px]",
        )}
      />
    </>
  );
}

function Body({
  text,
  isOwn,
  tail,
}: {
  text: string;
  isOwn: boolean;
  tail: boolean;
}) {
  return (
    <View
      className={cn(
        "rounded-[18px] px-3 py-[7px]",
        isOwn ? "bg-bubble-outgoing" : "bg-bubble-incoming",
      )}
      style={{ borderCurve: "continuous" }}
    >
      {tail && <Tail isOwn={isOwn} />}
      <Text
        className={cn(
          "text-body leading-[22px]",
          isOwn ? "text-on-accent" : "text-foreground",
        )}
      >
        {text}
      </Text>
    </View>
  );
}

function Content({
  message,
  isOwn,
  endsGroup,
}: {
  message: Message;
  isOwn: boolean;
  endsGroup: boolean;
}) {
  return (
    <SendingFade status={message.status}>
      <View className={cn("gap-0.5", isOwn ? "items-end" : "items-start")}>
        {message.attachments.map((attachment) => (
          <AttachmentView key={attachment.url} attachment={attachment} />
        ))}
        {message.body && (
          <Body
            text={message.body}
            isOwn={isOwn}
            tail={endsGroup && !message.linkPreview}
          />
        )}
        {message.linkPreview && (
          <LinkPreviewCard preview={message.linkPreview} />
        )}
      </View>
    </SendingFade>
  );
}

/** The sender's photo beside the last bubble of a run in group chats. */
function AvatarColumn({
  author,
  seed,
  visible,
}: {
  author: { avatarUrl: string | null; displayName: string };
  seed: string;
  visible: boolean;
}) {
  return (
    <View style={{ width: AVATAR_COLUMN }}>
      {visible && (
        <Avatar
          name={author.displayName}
          seed={seed}
          size="sm"
          uri={author.avatarUrl}
        />
      )}
    </View>
  );
}

/**
 * iMessage-style: your messages on the right, everyone else's on the left,
 * runs tucked together with a tail on the last one. Times stay hidden until
 * the conversation is dragged left.
 */
export function MessageBubble({
  message,
  isOwn,
  author,
  startsGroup,
  endsGroup,
  delivered,
}: {
  message: Message;
  isOwn: boolean;
  /** Set in group chats, where incoming runs show a name and photo. */
  author?: { avatarUrl: string | null; displayName: string };
  startsGroup: boolean;
  endsGroup: boolean;
  delivered: boolean;
}) {
  const showAuthor = author !== undefined && !isOwn;
  return (
    <View className={startsGroup ? "pt-2.5" : "pt-0.5"}>
      <SlideWithReveal enabled={isOwn}>
        <View
          className={cn(
            "flex-row items-end gap-2.5 px-4",
            isOwn ? "justify-end" : "justify-start",
          )}
        >
          {showAuthor && (
            <AvatarColumn
              author={author}
              seed={message.authorId}
              visible={endsGroup}
            />
          )}
          <View
            className={cn(
              "max-w-[75%] gap-0.5",
              isOwn ? "items-end" : "items-start",
            )}
          >
            {startsGroup && showAuthor && (
              <Text className="text-caption text-muted px-3">
                {author.displayName}
              </Text>
            )}
            <Content message={message} isOwn={isOwn} endsGroup={endsGroup} />
            <MessageMeta message={message} delivered={delivered} />
          </View>
        </View>
      </SlideWithReveal>
      <RevealedTime
        date={message.sentAt}
        top={startsGroup && showAuthor ? NAME_HEIGHT : 0}
      />
    </View>
  );
}
