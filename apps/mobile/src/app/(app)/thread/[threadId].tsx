import { useRef } from "react";
import { Text, View } from "react-native";
import { KeyboardGestureArea } from "react-native-keyboard-controller";
import {
  Stack,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";

import type { ComposerHandle } from "~/features/conversation/composer";
import type { ComposerHeight } from "~/features/conversation/composer-height";
import type { MessageListHandle } from "~/features/conversation/message-list";
import { Pending } from "~/components/pending";
import { useComposerBottomInset } from "~/features/conversation/composer";
import { useComposerHeight } from "~/features/conversation/composer-height";
import { FloatingComposer } from "~/features/conversation/floating-composer";
import { mentionableIn } from "~/features/conversation/mentionable";
import { MessageList } from "~/features/conversation/message-list";
import { usePacedMessages } from "~/features/conversation/paced-messages";
import {
  THREAD_HEADER_HEIGHT,
  ThreadHeader,
} from "~/features/conversation/thread-header";
import { useEditing } from "~/features/conversation/use-editing";
import { useReactionsSheet } from "~/features/conversation/use-reactions-sheet";
import { useDevConversation } from "~/features/dev/dev-conversation";
import { useDevTools } from "~/features/dev/dev-tools";
import { AccountScope, useAccount } from "~/features/messaging/account";
import { useConversation } from "~/features/messaging/conversations";
import { useMessages } from "~/features/messaging/messages";
import { useStayLive } from "~/features/messaging/stay-live";
import {
  useMarkThreadRead,
  useThreadState,
} from "~/features/messaging/threads";
import { useTypingReporter, useTypists } from "~/features/messaging/typing";
import { useActiveThread } from "~/features/notifications/push";
import { useMessageLayout } from "~/features/preferences/store";
import { useAccountPending } from "~/features/saved/offline-pill";

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
 * What the list needs before it shows: the thread and who's typing there
 * (`parts`) loaded with everyone's names, and the composer laid out (the
 * list leaves room for it).
 */
function shownList<Layout, Root>({
  parts,
  profilesLoaded,
  root,
  layout,
  composerHeight,
}: {
  parts: readonly { isLoading: boolean }[];
  profilesLoaded: boolean;
  root: Root | undefined;
  layout: Layout | undefined;
  composerHeight: ComposerHeight;
}) {
  const loading = parts.some(({ isLoading }) => isLoading) || !profilesLoaded;
  if (loading || root === undefined || layout === undefined) return null;
  if (composerHeight.laidOut === undefined) return null;
  return { composerHeight, layout, root };
}

/** The composer, its draft, and editing through it. */
function useDraft(conversationId: string, threadId: string) {
  const composer = useRef<ComposerHandle>(null);
  // A thread's draft is its own, apart from the conversation's.
  const draftId = `${conversationId} thread:${threadId}`;
  const editing = useEditing({ composer, conversationId, draftId });
  return { composer, draftId, editing };
}

/**
 * What an open thread keeps up: its read state, push and dev, and staying
 * live a while after it closes.
 */
function useWhileOpen(
  conversationId: string,
  threadId: string,
  thread: ReturnType<typeof useMessages>,
) {
  useMarkThreadRead(conversationId, threadId, thread.newestSentAt);
  useActiveThread(threadId);
  useStayLive(conversationId, threadId);
  useDevConversation(conversationId, thread, threadId);
}

/** The messages a thread shows: its original, then its replies. */
function shownMessages<Message>({
  messages,
  root,
}: {
  messages: readonly Message[];
  root?: Message;
}) {
  return root === undefined ? messages : [root, ...messages];
}

/** Who else is typing in a thread, and the reporting of this device's. */
function useThreadTyping(
  conversationId: string,
  threadId: string,
  messages: Parameters<typeof useTypists>[1]["messages"],
) {
  const { isLoading, typists } = useTypists(conversationId, {
    messages,
    threadId,
  });
  const report = useTypingReporter(conversationId, threadId);
  return { isLoading, report, typists };
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
  const thread = useMessages(conversationId, { threadId });
  const viewReactions = useReactionsSheet(conversationId, thread);
  const { conversation, profileOf, profilesLoaded, title } = useConversation(
    conversationId,
    shownMessages(thread),
  );
  const layout = useMessageLayout(conversation?.kind);
  const state = useThreadState(conversationId, threadId);
  // Others' new replies, paced in a busy thread (see `usePacedMessages`).
  const replies = usePacedMessages(thread.messages, address);
  const typing = useThreadTyping(conversationId, threadId, replies);
  const { composerHeight, report } = useComposerHeight();
  const list = useRef<MessageListHandle>(null);
  const { composer, draftId, editing } = useDraft(conversationId, threadId);
  useWhileOpen(conversationId, threadId, thread);

  const heading = headingFor(title, initialTitle);
  const toConversation = useOpenConversation(conversationId, threadId, heading);
  const missing = !thread.isLoading && thread.root === undefined;
  const shown = shownList({
    composerHeight,
    layout,
    parts: [thread, typing],
    profilesLoaded,
    root: thread.root,
  });

  const pending = useAccountPending(shown === null && !missing);

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
        <Pending phase={pending} />
        {shown !== null && pending === "ready" && (
          <MessageList
            ref={list}
            key={thread.viewKey}
            thread={{ replyCount: thread.replyCount, root: shown.root }}
            messages={replies}
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
            typists={typing.typists}
            onToggleReaction={thread.toggleReaction}
            editing={editing}
            onViewReactions={viewReactions}
          />
        )}
      </KeyboardGestureArea>
      <ThreadHeader
        title={heading}
        following={state.following}
        onOpenConversation={toConversation}
        onToggleFollowing={state.toggle}
      />
      {thread.root !== undefined && (
        <FloatingComposer
          ref={composer}
          draftId={draftId}
          placeholder="Reply"
          edit={editing}
          mentionable={mentionableIn(conversation, address, profileOf)}
          report={report}
          onChangeText={typing.report}
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
