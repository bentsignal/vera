import { useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import {
  KeyboardAvoidingView,
  useKeyboardState,
} from "react-native-keyboard-controller";
import { Stack, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { withUniwind } from "uniwind";

import type { AttachmentSource } from "~/features/messaging/attachments";
import { showActionSheet } from "~/components/action-sheet";
import { Composer } from "~/features/conversation/composer";
import { MessageList } from "~/features/conversation/message-list";
import { useDevTools } from "~/features/dev/dev-tools";
import { useAccount } from "~/features/messaging/account";
import {
  AttachmentError,
  useAttachmentUploader,
} from "~/features/messaging/attachments";
import {
  useConversation,
  useMarkRead,
  useMessages,
} from "~/features/messaging/conversations";
import { useActiveConversation } from "~/features/notifications/push";

const StyledKeyboardAvoidingView = withUniwind(KeyboardAvoidingView);

const ATTACHMENT_SOURCES = [
  { label: "Photos & Videos", source: "library" },
  { label: "Camera", source: "camera" },
  { label: "Files", source: "files" },
] as const;

function CenteredMessage({ text }: { text: string }) {
  return (
    <View className="bg-background flex-1 items-center justify-center">
      <Text className="text-body text-muted">{text}</Text>
    </View>
  );
}

function Conversation({ conversationId }: { conversationId: string }) {
  const { address } = useAccount();
  const { conversation, displayName, isLoading, title } =
    useConversation(conversationId);
  const messages = useMessages(conversationId);
  const uploadAttachments = useAttachmentUploader();
  const devTools = useDevTools();
  const [uploading, setUploading] = useState(false);
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const headerHeight = useHeaderHeight();
  useMarkRead(conversationId, messages.newestSentAt);
  useActiveConversation(conversationId);

  async function attach(source: AttachmentSource) {
    setUploading(true);
    const attachments = await uploadAttachments(source).catch(
      (error: unknown) =>
        error instanceof AttachmentError
          ? error.message
          : "Couldn't upload that. Try again.",
    );
    setUploading(false);
    if (typeof attachments === "string") {
      Alert.alert("Upload Failed", attachments);
    } else if (attachments.length > 0) {
      messages.sendMessage("", attachments);
    }
  }

  if (isLoading) return <CenteredMessage text="" />;
  if (conversation === undefined) {
    return <CenteredMessage text="This conversation doesn't exist." />;
  }

  return (
    <StyledKeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
      className="bg-background flex-1"
    >
      <Stack.Title>{title}</Stack.Title>
      <MessageList
        messages={messages.messages}
        self={address}
        authorName={conversation.kind === "direct" ? undefined : displayName}
        onEndReached={messages.loadOlder}
      />
      {uploading && (
        <View className="flex-row items-center justify-center gap-2 py-1">
          <ActivityIndicator size="small" />
          <Text className="text-footnote text-muted">Uploading…</Text>
        </View>
      )}
      <Composer
        onSend={(body) => {
          messages.sendMessage(body);
          devTools.replyToMe(conversationId);
        }}
        onAttach={() =>
          showActionSheet(
            ATTACHMENT_SOURCES.map(({ label, source }) => ({
              label,
              onPress: () => void attach(source),
            })),
          )
        }
        keyboardVisible={keyboardVisible}
      />
    </StyledKeyboardAvoidingView>
  );
}

export default function ConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <Conversation key={conversationId} conversationId={conversationId} />;
}
