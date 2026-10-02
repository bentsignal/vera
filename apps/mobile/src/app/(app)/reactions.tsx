import { useLocalSearchParams } from "expo-router";

import { ReactionsSheet } from "~/features/conversation/reactions-sheet";
import { AccountScope } from "~/features/messaging/account";

/** The sheet of who reacted to a message, opened from its long-press menu. */
export default function ReactionsScreen() {
  const { account, conversationId, messageId } = useLocalSearchParams<{
    account?: string;
    conversationId: string;
    messageId: string;
  }>();
  return (
    <AccountScope address={account}>
      <ReactionsSheet conversationId={conversationId} messageId={messageId} />
    </AccountScope>
  );
}
