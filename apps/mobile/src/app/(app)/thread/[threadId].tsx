import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardGestureArea } from "react-native-keyboard-controller";
import {
  Stack,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";

import type { MessageListHandle } from "~/features/conversation/message-list";
import { useComposerBottomInset } from "~/features/conversation/composer";
import { FloatingComposer } from "~/features/conversation/floating-composer";
import { mentionableIn } from "~/features/conversation/mentionable";
import { MessageList } from "~/features/conversation/message-list";
import {
  THREAD_HEADER_HEIGHT,
  ThreadHeader,
} from "~/features/conversation/thread-header";
import { useReactionsSheet } from "~/features/conversation/use-reactions-sheet";
import { useDevTools } from "~/features/dev/dev-tools";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { useConversation } from "~/features/messaging/conversations";
import { useMessages } from "~/features/messaging/messages";
import {
  useMarkThreadRead,
  useThreadState,
} from "~/features/messaging/threads";
import { useTypingReporter, useTypists } from "~/features/messaging/typing";
import { useActiveThread } from "~/features/notifications/push";
import { useMessageLayout } from "~/features/preferences/store";

/** The conversation's name from the opening screen, until it loads. */
function headingFor(title: string, initialTitle: string | undefined) {
  return title === "" ? (initialTitle ?? "") : title;
}

/** Whether a stack screen's route params name this conversation. */
function namesConversation(params: unknown, conversationId: string) {
  return (
    typeof params === "object" &&
    params !== null &&
    Reflect.get(params, "conversationId") === conversationId
  );
}

/**
 * Opens the conversation a thread is in: back to it when the thread was
 * opened from there, or at the thread's original message otherwise (from
 * the Inbox, Activity, or a push), so the stack never holds it twice.
 */
function useOpenConversation(
  conversationId: string,
  threadId: string,
  title: string,
) {
  const router = useRouter();
  const navigation = useNavigation();
  const { address } = useAccount();
  return () => {
    const { index, routes } = navigation.getState() ?? { index: 0, routes: [] };
    const below = routes[index - 1];
    const cameFrom =
      below?.name === "conversation/[conversationId]" &&
      namesConversation(below.params, conversationId);
    if (cameFrom) {
      router.back();
      return;
    }
    router.push({
      params: { account: address, conversationId, messageId: threadId, title },
      pathname: "/conversation/[conversationId]",
    });
  };
}

/**
 * What the list needs before it shows: the thread loaded with everyone's
 * names, and the composer laid out (the list leaves room for it).
 */
function shownList<Layout, Root>({
  loading,
  root,
  layout,
  composerHeight,
}: {
  loading: boolean;
  root: Root | undefined;
  layout: Layout | undefined;
  composerHeight: number | undefined;
}) {
  if (loading || root === undefined || layout === undefined) return null;
  if (composerHeight === undefined) return null;
  return { composerHeight, layout, root };
}

/**
 * A thread: the message it answers on top, its replies under it like
 * comments, and a composer for the next reply. Its bell turns its
 * notifications off or back on.
 */
function Thread({
  conversationId,
  threadId,
  initialTitle,
}: {
  conversationId: string;
  threadId: string;
  initialTitle?: string;
}) {
  const composerBottomInset = useComposerBottomInset();
  const { address } = useAccount();
  const devTools = useDevTools();
  const viewReactions = useReactionsSheet(conversationId);
  const { conversation, profileOf, profilesLoaded, title } =
    useConversation(conversationId);
  const layout = useMessageLayout(conversation?.kind);
  const thread = useMessages(conversationId, { threadId });
  const state = useThreadState(conversationId, threadId);
  const typists = useTypists(conversationId, {
    messages: thread.messages,
    threadId,
  });
  const reportTyping = useTypingReporter(conversationId, threadId);
  const [composerHeight, setComposerHeight] = useState<number>();
  const list = useRef<MessageListHandle>(null);
  useMarkThreadRead(conversationId, threadId, thread.newestSentAt);
  useActiveThread(threadId);

  const heading = headingFor(title, initialTitle);
  const openConversation = useOpenConversation(
    conversationId,
    threadId,
    heading,
  );
  const { root } = thread;
  const missing = !thread.isLoading && root === undefined;
  const shown = shownList({
    composerHeight,
    layout,
    loading: thread.isLoading || !profilesLoaded,
    root,
  });

  return (
    <View className="bg-background flex-1">
      <Stack.Title>Thread</Stack.Title>
      {missing && (
        <View className="flex-1 items-center justify-center">
          <Text className="text-body text-muted">
            This message doesn't exist.
          </Text>
        </View>
      )}
      <KeyboardGestureArea interpolator="ios" offset={60} style={{ flex: 1 }}>
        {shown !== null && (
          <MessageList
            ref={list}
            key={thread.viewKey}
            thread={{ replyCount: thread.replyCount, root: shown.root }}
            messages={thread.messages}
            self={address}
            layout={shown.layout}
            profileOf={profileOf}
            showAuthors={conversation?.kind !== "direct"}
            hasNewer={thread.hasNewer}
            onLoadOlder={thread.loadOlder}
            onLoadNewer={thread.loadNewer}
            onJumpToLatest={thread.jumpToLatest}
            bottomInset={composerBottomInset}
            topInset={THREAD_HEADER_HEIGHT}
            composerHeight={shown.composerHeight}
            typists={typists}
            onToggleReaction={thread.toggleReaction}
            onViewReactions={viewReactions}
          />
        )}
      </KeyboardGestureArea>
      <ThreadHeader
        title={heading}
        following={state.following}
        onOpenConversation={openConversation}
        onToggleFollowing={state.toggle}
      />
      {root !== undefined && (
        <FloatingComposer
          // A thread's draft is its own, apart from the conversation's.
          draftId={`${conversationId} thread:${threadId}`}
          placeholder="Reply"
          mentionable={mentionableIn(conversation, address, profileOf)}
          onHeight={setComposerHeight}
          onChangeText={reportTyping}
          onSend={(draft) => {
            thread.sendMessage(draft);
            list.current?.scrollToLatest();
            devTools.replyToMe(conversationId, threadId);
          }}
        />
      )}
    </View>
  );
}

export default function ThreadScreen() {
  const { account, conversationId, threadId, title } = useLocalSearchParams<{
    /** The signed-in account this thread is opened as. */
    account?: string;
    conversationId: string;
    threadId: string;
    /** The conversation's name, shown until it loads. */
    title?: string;
  }>();
  return (
    <AccountScope address={account}>
      <Thread
        key={`${account ?? ""}:${conversationId}:${threadId}`}
        conversationId={conversationId}
        threadId={threadId}
        initialTitle={title}
      />
    </AccountScope>
  );
}
