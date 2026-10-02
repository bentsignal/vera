import { useState } from "react";
import { Text, View } from "react-native";
import {
  KeyboardAvoidingView,
  useKeyboardState,
} from "react-native-keyboard-controller";
import { Stack, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { withUniwind } from "uniwind";

import type { Message } from "~/features/conversation/types";
import { ActionSheet } from "~/components/action-sheet";
import { Composer } from "~/features/conversation/composer";
import { MessageList } from "~/features/conversation/message-list";
import { me } from "~/mock/people";
import { findThread } from "~/mock/threads";

const StyledKeyboardAvoidingView = withUniwind(KeyboardAvoidingView);

// Attachment upload arrives with file storage.
const ATTACHMENT_SOURCES = [
  { label: "Photos & Videos" },
  { label: "Camera" },
  { label: "Files" },
];

function NotFound() {
  return (
    <View className="bg-background flex-1 items-center justify-center">
      <Stack.Title>Not Found</Stack.Title>
      <Text className="text-body text-muted">
        This conversation doesn't exist.
      </Text>
    </View>
  );
}

function Conversation({
  title,
  kind,
  initialMessages,
}: {
  title: string;
  kind: "direct" | "group" | "channel";
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [attaching, setAttaching] = useState(false);
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const headerHeight = useHeaderHeight();

  function send(body: string) {
    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        authorId: me.id,
        sentAt: new Date(),
        body,
        attachments: [],
      },
    ]);
  }

  return (
    <StyledKeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
      className="bg-background flex-1"
    >
      <Stack.Title>{title}</Stack.Title>
      <MessageList messages={messages} showAuthors={kind !== "direct"} />
      <Composer
        onSend={send}
        onAttach={() => setAttaching(true)}
        keyboardVisible={keyboardVisible}
      />
      <ActionSheet
        isPresented={attaching}
        onDismiss={() => setAttaching(false)}
        actions={ATTACHMENT_SOURCES}
      />
    </StyledKeyboardAvoidingView>
  );
}

export default function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const thread = findThread(conversationId);
  if (!thread) return <NotFound />;
  return (
    <Conversation
      key={conversationId}
      title={thread.title}
      kind={thread.kind}
      initialMessages={thread.messages}
    />
  );
}
