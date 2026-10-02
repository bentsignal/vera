import { useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import {
  KeyboardGestureArea,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";

import type { AttachmentSource } from "~/features/messaging/attachments";
import { showActionSheet } from "~/components/action-sheet";
import { Composer } from "~/features/conversation/composer";
import { MessageList } from "~/features/conversation/message-list";
import { useDevTools } from "~/features/dev/dev-tools";
import { AccountScope, useAccount } from "~/features/messaging/account";
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
import { usePreference } from "~/features/preferences/store";

const ATTACHMENT_SOURCES = [
  { label: "Photos & Videos", source: "library" },
  { label: "Camera", source: "camera" },
  { label: "Files", source: "files" },
] as const;

function Conversation({
  conversationId,
  anchorId,
  initialTitle,
}: {
  conversationId: string;
  anchorId?: string;
  initialTitle?: string;
}) {
  const insets = useSafeAreaInsets();
  const { address } = useAccount();
  const { conversation, isLoading, profileOf, title } =
    useConversation(conversationId);
  const layout = usePreference("messageLayout");
  const messages = useMessages(conversationId, anchorId);
  const uploadAttachments = useAttachmentUploader();
  const devTools = useDevTools();
  const [uploading, setUploading] = useState(false);
  const [composerHeight, setComposerHeight] = useState(56);
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

  // The title from the opening screen shows until the conversation loads.
  const heading = title === "" ? (initialTitle ?? "") : title;
  if (!isLoading && conversation === undefined) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <Stack.Title>{heading}</Stack.Title>
        <Text className="text-body text-muted">
          This conversation doesn't exist.
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-background flex-1">
      <Stack.Title>{heading}</Stack.Title>
      <KeyboardGestureArea interpolator="ios" offset={60} style={{ flex: 1 }}>
        {messages.isLoading ? null : (
          <MessageList
            key={messages.viewKey}
            messages={messages.messages}
            self={address}
            layout={layout}
            profileOf={profileOf}
            showAuthors={conversation?.kind !== "direct"}
            anchorId={messages.anchor}
            hasNewer={messages.hasNewer}
            onStartReached={messages.loadOlder}
            onEndReached={messages.loadNewer}
            onJumpToLatest={messages.jumpToLatest}
            bottomInset={insets.bottom}
            composerHeight={composerHeight}
          />
        )}
      </KeyboardGestureArea>
      <KeyboardStickyView
        offset={{ closed: 0, opened: insets.bottom }}
        // Floats over the messages, which scroll all the way to the bottom.
        style={{ bottom: 0, left: 0, position: "absolute", right: 0 }}
        onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
      >
        {uploading && (
          <View className="flex-row items-center justify-center gap-2 py-1">
            <ActivityIndicator size="small" />
            <Text className="text-footnote text-muted">Uploading…</Text>
          </View>
        )}
        <View style={{ paddingBottom: insets.bottom }}>
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
          />
        </View>
      </KeyboardStickyView>
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
