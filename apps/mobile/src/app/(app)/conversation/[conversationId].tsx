import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardGestureArea } from "react-native-keyboard-controller";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import type { ComposerHandle } from "~/features/conversation/composer";
import type { MessageListHandle } from "~/features/conversation/message-list";
import type { MessageLayout } from "~/features/preferences/store";
import { useComposerBottomInset } from "~/features/conversation/composer";
import {
  CONVERSATION_HEADER_HEIGHT,
  ConversationHeader,
} from "~/features/conversation/conversation-header";
import { FloatingComposer } from "~/features/conversation/floating-composer";
import { mentionableIn } from "~/features/conversation/mentionable";
import { MessageList } from "~/features/conversation/message-list";
import { useEditing } from "~/features/conversation/use-editing";
import { useReactionsSheet } from "~/features/conversation/use-reactions-sheet";
import { useReplies } from "~/features/conversation/use-replies";
import { useDevConversation } from "~/features/dev/dev-conversation";
import { useDevTools } from "~/features/dev/dev-tools";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { useConversation } from "~/features/messaging/conversations";
import { useMemberNotices } from "~/features/messaging/member-events";
import { useMarkRead, useMessages } from "~/features/messaging/messages";
import { useActiveConversation } from "~/features/notifications/push";
import { useMessageLayout } from "~/features/preferences/store";

/**
 * What the header shows: the title, photo, and badge arrive together, so
 * the name capsule changes at most once instead of shifting as each piece
 * loads. A group or channel shows the title from the opening screen until
 * its own is known. A direct conversation waits for the other person's
 * profile instead, usually already loaded, since their badge would
 * otherwise widen the capsule when it arrived.
 */
function headerFor(
  { kind, members, profileOf, title }: ReturnType<typeof useConversation>,
  self: string,
  initialTitle: string | undefined,
) {
  if (title === "") {
    const shown = kind === "direct" ? "" : (initialTitle ?? "");
    return { affiliated: false, avatarUrl: null, title: shown };
  }
  const other =
    kind === "direct" ? members.find((member) => member !== self) : undefined;
  if (other === undefined) return { affiliated: false, avatarUrl: null, title };
  const { affiliated, avatarUrl } = profileOf(other);
  return { affiliated, avatarUrl, title };
}

/**
 * The list shows once its messages, their reactions, a group's notices,
 * and everyone's names and photos are in, so nothing changes size or swaps
 * as it fades in.
 */
function listReady(
  parts: readonly { isLoading: boolean }[],
  layout: MessageLayout | undefined,
  profilesLoaded: boolean,
): layout is MessageLayout {
  return (
    parts.every((part) => !part.isLoading) &&
    layout !== undefined &&
    profilesLoaded
  );
}

/** Opens the conversation's info, titled `title` until it loads. */
function useOpenInfo(conversationId: string) {
  const router = useRouter();
  const { address } = useAccount();
  return (title: string) => {
    router.push({
      params: { account: address, conversationId, title },
      pathname: "/conversation-info/[conversationId]",
    });
  };
}

function MissingConversation({ heading }: { heading: string }) {
  return (
    <View className="bg-background flex-1 items-center justify-center">
      <Stack.Title>{heading}</Stack.Title>
      <Text className="text-body text-muted">
        This conversation doesn't exist.
      </Text>
      <ConversationHeader title={heading} avatarUrl={null} />
    </View>
  );
}

function Conversation({
  conversationId,
  anchorId,
  initialTitle,
}: {
  conversationId: string;
  anchorId?: string;
  initialTitle?: string;
}) {
  const openInfo = useOpenInfo(conversationId);
  const composerBottomInset = useComposerBottomInset();
  const { address } = useAccount();
  const devTools = useDevTools();
  const viewReactions = useReactionsSheet(conversationId);
  const loaded = useConversation(conversationId);
  const { conversation, isLoading, profileOf, profilesLoaded } = loaded;
  const layout = useMessageLayout(conversation?.kind);
  const messages = useMessages(conversationId, { anchor: anchorId });
  const notices = useMemberNotices(conversationId, conversation, messages);
  const composer = useRef<ComposerHandle>(null);
  // Undefined until the composer is laid out: the list leaves room for it
  // under the newest message, so it waits rather than shift once it knows.
  const [composerHeight, setComposerHeight] = useState<number>();
  const list = useRef<MessageListHandle>(null);
  useMarkRead(conversationId, messages.newestSentAt);
  useActiveConversation(conversationId);
  useDevConversation(messages);

  const header = headerFor(loaded, address, initialTitle);
  const heading = header.title;
  const replies = useReplies({
    composer,
    conversationId,
    profileOf,
    title: heading,
  });
  const editing = useEditing({ composer, conversationId });
  if (!isLoading && conversation === undefined) {
    return (
      <MissingConversation
        heading={heading === "" ? (initialTitle ?? "") : heading}
      />
    );
  }

  return (
    <View className="bg-background flex-1">
      <Stack.Title>{heading}</Stack.Title>
      <KeyboardGestureArea interpolator="ios" offset={60} style={{ flex: 1 }}>
        {listReady([messages, notices], layout, profilesLoaded) &&
          composerHeight !== undefined && (
            <MessageList
              ref={list}
              key={messages.viewKey}
              messages={messages.messages}
              notices={notices.notices}
              self={address}
              layout={layout}
              profileOf={profileOf}
              showAuthors={conversation?.kind !== "direct"}
              anchorId={messages.anchor}
              hasNewer={messages.hasNewer}
              onLoadOlder={messages.loadOlder}
              onLoadNewer={messages.loadNewer}
              onJumpToLatest={messages.jumpToLatest}
              bottomInset={composerBottomInset}
              topInset={CONVERSATION_HEADER_HEIGHT}
              composerHeight={composerHeight}
              onToggleReaction={messages.toggleReaction}
              onOpenThread={replies.openThread}
              onReply={replies.reply}
              editing={editing}
              onViewReactions={viewReactions}
            />
          )}
      </KeyboardGestureArea>
      <ConversationHeader
        title={heading}
        kind={loaded.kind}
        avatarUrl={header.avatarUrl}
        affiliated={header.affiliated}
        onOpenInfo={() => openInfo(heading)}
      />
      <FloatingComposer
        ref={composer}
        draftId={conversationId}
        mentionable={mentionableIn(conversation, address, profileOf)}
        onHeight={setComposerHeight}
        replyingTo={replies.replyingTo}
        onCancelReply={replies.cancel}
        edit={editing}
        onSend={(draft) => {
          messages.sendMessage(draft, replies.replyTo);
          replies.cancel();
          list.current?.scrollToLatest();
          devTools.replyToMe(conversationId);
        }}
      />
    </View>
  );
}

export default function ConversationScreen() {
  const { account, conversationId, messageId, title } = useLocalSearchParams<{
    /** The signed-in account this conversation is opened as. */
    account?: string;
    conversationId: string;
    messageId?: string;
    title?: string;
  }>();
  return (
    <AccountScope address={account}>
      <Conversation
        key={`${account ?? ""}:${conversationId}:${messageId ?? ""}`}
        conversationId={conversationId}
        anchorId={messageId}
        initialTitle={title}
      />
    </AccountScope>
  );
}
