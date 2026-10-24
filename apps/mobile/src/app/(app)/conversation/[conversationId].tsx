import { useRef } from "react";
import { Text, View } from "react-native";
import { KeyboardGestureArea } from "react-native-keyboard-controller";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import type { ComposerHandle } from "~/features/conversation/composer";
import type { MessageListHandle } from "~/features/conversation/message-list";
import type { MessageLayout } from "~/features/preferences/store";
import { Pending } from "~/components/pending";
import { useAfterSend } from "~/features/conversation/after-send";
import { useComposerBottomInset } from "~/features/conversation/composer";
import { useComposerHeight } from "~/features/conversation/composer-height";
import {
  CONVERSATION_HEADER_HEIGHT,
  ConversationHeader,
} from "~/features/conversation/conversation-header";
import { FloatingComposer } from "~/features/conversation/floating-composer";
import { mentionableIn } from "~/features/conversation/mentionable";
import { MessageList } from "~/features/conversation/message-list";
import { usePacedMessages } from "~/features/conversation/paced-messages";
import { useEditing } from "~/features/conversation/use-editing";
import { useReactionsSheet } from "~/features/conversation/use-reactions-sheet";
import { useReplies } from "~/features/conversation/use-replies";
import { useDevConversation } from "~/features/dev/dev-conversation";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { useConversation } from "~/features/messaging/conversations";
import { useMemberNotices } from "~/features/messaging/member-events";
import { useMarkRead, useMessages } from "~/features/messaging/messages";
import { useStayLive } from "~/features/messaging/stay-live";
import { useTypingReporter, useTypists } from "~/features/messaging/typing";
import { useActiveConversation } from "~/features/notifications/push";
import { useMessageLayout } from "~/features/preferences/store";
import { useAccountPending } from "~/features/saved/offline-pill";
import { useSavedConversation } from "~/features/saved/show-saved";

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

/** Who else is typing here, and the reporting of this device's. */
function useConversationTyping(
  conversationId: string,
  messages: Parameters<typeof useTypists>[1]["messages"],
) {
  const { isLoading, typists } = useTypists(conversationId, { messages });
  const report = useTypingReporter(conversationId);
  return { isLoading, report, typists };
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

/**
 * What an open conversation keeps up: its read state, push and dev, and
 * staying live a while after it closes.
 */
function useWhileOpen(
  conversationId: string,
  messages: ReturnType<typeof useMessages>,
) {
  useMarkRead(conversationId, messages.newestSentAt);
  useActiveConversation(conversationId);
  useStayLive(conversationId);
  useDevConversation(conversationId, messages);
}

/** The composer, and replying and editing through it. */
function useComposing(
  options: Omit<Parameters<typeof useReplies>[0], "composer">,
) {
  const composer = useRef<ComposerHandle>(null);
  const replies = useReplies({ ...options, composer });
  const editing = useEditing({
    composer,
    conversationId: options.conversationId,
  });
  return { composer, editing, replies };
}

/**
 * What shows while the conversation opens (`usePending`), and what's saved
 * of it if it's slow to (`useSavedConversation`).
 */
function useOpening(
  conversationId: string,
  messages: ReturnType<typeof useMessages>,
  shown: boolean,
) {
  useSavedConversation(conversationId, messages, !shown);
  return useAccountPending(!shown);
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
  const afterSend = useAfterSend(conversationId);
  const messages = useMessages(conversationId, { anchor: anchorId });
  const viewReactions = useReactionsSheet(conversationId, messages);
  const loaded = useConversation(conversationId, messages.messages);
  const { conversation, isLoading, profileOf, profilesLoaded } = loaded;
  const layout = useMessageLayout(conversation?.kind);
  const notices = useMemberNotices(conversationId, conversation, messages);
  // Others' new messages, paced in a busy conversation (who's typing
  // follows what's shown, so a message grows out of its indicator).
  const shownMessages = usePacedMessages(messages.messages, address);
  const typing = useConversationTyping(conversationId, shownMessages);
  // Not laid out yet: the list leaves room for it under the newest
  // message, so it waits rather than shift once it knows.
  const { composerHeight, report } = useComposerHeight();
  const list = useRef<MessageListHandle>(null);
  useWhileOpen(conversationId, messages);

  const header = headerFor(loaded, address, initialTitle);
  const heading = header.title;
  const { composer, editing, replies } = useComposing({
    conversationId,
    profileOf,
    title: heading,
  });
  const shown =
    listReady([messages, notices, typing], layout, profilesLoaded) &&
    composerHeight.laidOut !== undefined;
  const pending = useOpening(conversationId, messages, shown);
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
        <Pending phase={pending} />
        {shown && pending === "ready" && (
          <MessageList
            ref={list}
            key={messages.viewKey}
            messages={shownMessages}
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
            typists={typing.typists}
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
        report={report}
        onChangeText={typing.report}
        replyingTo={replies.replyingTo}
        onCancelReply={replies.cancel}
        edit={editing}
        onSend={(draft) => {
          messages.sendMessage(draft, replies.replyTo);
          replies.cancel();
          list.current?.scrollToLatest();
          afterSend();
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
