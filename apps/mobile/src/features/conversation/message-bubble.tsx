import { useState } from "react";
import { Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

import type { Message } from "./types";
import { Avatar } from "~/components/avatar";
import { cn } from "~/lib/cn";
import { AttachmentView } from "./attachment-view";
import { BUBBLE_RADIUS, TailedBubble } from "./bubble-shape";
import { LinkPreviewCard } from "./link-preview-card";
import { InteractiveMessage } from "./message-reactions";
import { MessageMeta, SendingFade } from "./message-status";
import { RevealedTime, SlideWithReveal } from "./reveal";

/** Width of the avatar column beside incoming bubbles in group chats. */
const AVATAR_COLUMN = 28;
/** The sender's name above a run, plus the gap under it. */
const NAME_HEIGHT = 18;

function Body({
  text,
  isOwn,
  tail,
}: {
  text: string;
  isOwn: boolean;
  tail: boolean;
}) {
  const [size, setSize] = useState<{ height: number; width: number }>();
  const outgoing = useCSSVariable("--color-bubble-outgoing");
  const incoming = useCSSVariable("--color-bubble-incoming");
  const color = isOwn ? outgoing : incoming;
  // With a tail the whole bubble is drawn as one shape, once it is sized.
  const shaped = tail && size !== undefined && typeof color === "string";
  return (
    <View
      onLayout={(event) => {
        const { height, width } = event.nativeEvent.layout;
        if (tail) setSize({ height, width });
      }}
      className={cn(
        "px-3 py-[7px]",
        !shaped && (isOwn ? "bg-bubble-outgoing" : "bg-bubble-incoming"),
      )}
      style={{ borderCurve: "continuous", borderRadius: BUBBLE_RADIUS }}
    >
      {shaped && (
        <TailedBubble
          width={size.width}
          height={size.height}
          color={color}
          isOwn={isOwn}
        />
      )}
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
  visible,
}: {
  author: { avatarUrl: string | null; displayName: string };
  visible: boolean;
}) {
  return (
    <View style={{ width: AVATAR_COLUMN }}>
      {visible && (
        <Avatar name={author.displayName} size="sm" uri={author.avatarUrl} />
      )}
    </View>
  );
}

/** A message's bubbles, with its sender's name, reactions, and status. */
function BubbleColumn({
  message,
  isOwn,
  name,
  endsGroup,
  delivered,
}: {
  message: Message;
  isOwn: boolean;
  /** The sender's name, above the first bubble of a run in group chats. */
  name?: string;
  endsGroup: boolean;
  delivered: boolean;
}) {
  return (
    <View
      className={cn("max-w-[75%] gap-0.5", isOwn ? "items-end" : "items-start")}
    >
      {name !== undefined && (
        <Text className="text-caption text-muted px-3">{name}</Text>
      )}
      <InteractiveMessage
        message={message}
        align={isOwn ? "end" : "start"}
        shape="bubble"
      >
        <Content message={message} isOwn={isOwn} endsGroup={endsGroup} />
      </InteractiveMessage>
      <MessageMeta message={message} delivered={delivered} />
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
          {showAuthor && <AvatarColumn author={author} visible={endsGroup} />}
          <BubbleColumn
            message={message}
            isOwn={isOwn}
            name={startsGroup && showAuthor ? author.displayName : undefined}
            endsGroup={endsGroup}
            delivered={delivered}
          />
        </View>
      </SlideWithReveal>
      <RevealedTime
        date={message.sentAt}
        top={startsGroup && showAuthor ? NAME_HEIGHT : 0}
      />
    </View>
  );
}
