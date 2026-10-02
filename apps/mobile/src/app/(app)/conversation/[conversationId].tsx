import type { Attachment } from "@decentralized-convex/messages";
import { useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import {
  KeyboardGestureArea,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import type { AttachmentSource } from "~/features/messaging/attachments";
import { showActionSheet } from "~/components/action-sheet";
import { Composer } from "~/features/conversation/composer";
import {
  CONVERSATION_HEADER_HEIGHT,
  ConversationHeader,
} from "~/features/conversation/conversation-header";
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

/**
 * The composer floating over the bottom of the conversation, with
 * attachment uploads. Reports its height so messages can scroll under it.
 */
function FloatingComposer({
  conversationId,
  onHeight,
  onSend,
}: {
  conversationId: string;
  onHeight: (height: number) => void;
  onSend: (body: string, attachments?: Attachment[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const uploadAttachments = useAttachmentUploader();
  const devTools = useDevTools();
  const [uploading, setUploading] = useState(false);

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
      onSend("", attachments);
    }
  }

  return (
    <KeyboardStickyView
      offset={{ closed: 0, opened: insets.bottom }}
      // Floats over the messages, which scroll all the way to the bottom.
      style={{ bottom: 0, left: 0, position: "absolute", right: 0 }}
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
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
            onSend(body);
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
  );
}

/** The other person in a direct conversation, whose photo heads it. */
function otherMember(
  conversation: ReturnType<typeof useConversation>["conversation"],
  self: string,
) {
  if (conversation?.kind !== "direct") return undefined;
  return conversation.members.find((member) => member !== self);
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { address } = useAccount();
  const { conversation, isLoading, profileOf, title } =
    useConversation(conversationId);
  const layout = usePreference("messageLayout");
  const messages = useMessages(conversationId, anchorId);
  const [composerHeight, setComposerHeight] = useState(56);
  useMarkRead(conversationId, messages.newestSentAt);
  useActiveConversation(conversationId);

  // The title from the opening screen shows until the conversation loads.
  const heading = title === "" ? (initialTitle ?? "") : title;
  const other = otherMember(conversation, address);
  if (!isLoading && conversation === undefined) {
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
            topInset={CONVERSATION_HEADER_HEIGHT}
            composerHeight={composerHeight}
            onToggleReaction={messages.toggleReaction}
            onViewReactions={(messageId) =>
              router.push({
                params: { account: address, conversationId, messageId },
                pathname: "/reactions",
              })
            }
          />
        )}
      </KeyboardGestureArea>
      <ConversationHeader
        title={heading}
        kind={conversation?.kind}
        avatarUrl={other === undefined ? null : profileOf(other).avatarUrl}
        onOpenInfo={() =>
          router.push({
            params: { account: address, conversationId, title: heading },
            pathname: "/conversation-info/[conversationId]",
          })
        }
      />
      <FloatingComposer
        conversationId={conversationId}
        onHeight={setComposerHeight}
        onSend={messages.sendMessage}
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
