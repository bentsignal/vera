import type { ConversationSummary } from "./types";
import { useRunAs } from "~/features/messaging/account";
import { ConversationRow } from "./conversation-row";
import { inboxSwipeActions } from "./swipe-actions";
import { SwipeRow } from "./swipe-row";

/**
 * An Inbox row on Android: tap to open, swipe right to Pin, swipe left to
 * hide a channel. iOS has its own native row (`inbox-row.ios.tsx`).
 */
export function InboxRow({
  conversation,
  showAccount,
}: {
  conversation: ConversationSummary;
  showAccount: boolean;
}) {
  const runAs = useRunAs();
  return (
    <SwipeRow {...inboxSwipeActions(runAs, conversation)}>
      <ConversationRow conversation={conversation} showAccount={showAccount} />
    </SwipeRow>
  );
}
