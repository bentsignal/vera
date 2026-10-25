import type { Message } from "@decentralized-convex/messages";

type TargetMessage = Pick<
  Message,
  "messageId" | "sentAt" | "threadOnly" | "threadId"
>;
type RoutingItem = {
  readonly conversation: { readonly conversationId: string };
} & (
  | {
      readonly kind: "thread";
      readonly threadId: string;
      readonly latest: TargetMessage;
    }
  | {
      readonly kind: "reactions" | "mention" | "reply";
      readonly message: TargetMessage;
    }
  | { readonly kind: "messages" }
);

/** The message a row is about, for a reaction, a mention, or a reply. */
function itemMessage(item: RoutingItem) {
  if (item.kind === "thread") return item.latest;
  return item.kind === "reactions" ||
    item.kind === "mention" ||
    item.kind === "reply"
    ? item.message
    : undefined;
}

/** Where tapping a row goes: the conversation, or a reply's thread. */
export function activityDestination({
  account,
  item,
  title,
}: {
  account: string;
  title: string;
  item: RoutingItem;
}) {
  const { conversationId } = item.conversation;
  const message = itemMessage(item);
  // A reaction to or mention in a reply kept in its thread opens the
  // thread, where the reply is.
  const threadId =
    item.kind === "thread"
      ? item.threadId
      : message?.threadOnly === true
        ? message.threadId
        : undefined;
  if (threadId !== undefined) {
    return {
      params: {
        account,
        conversationId,
        threadId,
        ...(message === undefined
          ? {}
          : {
              messageId: message.messageId,
              targetSentAt: String(message.sentAt),
            }),
      },
      pathname: "/thread/[threadId]" as const,
    };
  }
  return {
    params: {
      account,
      conversationId,
      title,
      // A reaction, a mention, or a reply opens at the message.
      ...(message === undefined ? {} : { messageId: message.messageId }),
    },
    pathname: "/conversation/[conversationId]" as const,
  };
}
