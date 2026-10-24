import type { MessageListProps } from "~/features/conversation/message-list";
import { useComposerHeight } from "~/features/conversation/composer-height";
import { MessageList } from "~/features/conversation/message-list";
import { NativeMessageList } from "./native-message-list";
import { useNativeList } from "./switch";

/**
 * A conversation's or thread's messages: in the native list when it's on
 * and this binary has it (`useNativeList`), and otherwise in the React
 * Native list, unchanged.
 */
export function ConversationList(props: MessageListProps) {
  return useNativeList() ? (
    <NativeMessageList {...props} />
  ) : (
    <MessageList {...props} />
  );
}

/**
 * The composer's height for the list a conversation shows: the React
 * Native list closes its room after a send, which the field's glass waits
 * for; the native list takes each height at once (see `useComposerHeight`).
 */
export function useConversationComposerHeight() {
  return useComposerHeight({ roomCloses: !useNativeList() });
}
