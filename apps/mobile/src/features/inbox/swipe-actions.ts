import { pds } from "@vera/backend/pds";

import type { SwipeAction } from "./swipe-row";
import type { ConversationSummary } from "./types";
import type { useRunAs } from "~/features/messaging/account";

type RunAs = ReturnType<typeof useRunAs>;

export function togglePin(runAs: RunAs, conversation: ConversationSummary) {
  void runAs(
    conversation.account,
    pds.messages.setPinned({
      conversationId: conversation.id,
      pinned: conversation.pinnedAt === null,
    }),
  );
}

/**
 * An Inbox row's swipe actions. Swipe right to Pin or Unpin; swipe left to
 * hide a channel from the Inbox (it stays in its space). Mark as Unread
 * and Delete join these lists later.
 */
export function inboxSwipeActions(
  runAs: RunAs,
  conversation: ConversationSummary,
) {
  const pinned = conversation.pinnedAt !== null;
  const leading = [
    {
      key: "pin",
      label: pinned ? "Unpin" : "Pin",
      icon: pinned
        ? { android: "keep_off", ios: "pin.slash.fill" }
        : { android: "push_pin", ios: "pin.fill" },
      className: "bg-accent",
      onPress: () => togglePin(runAs, conversation),
    } satisfies SwipeAction,
  ];
  const hide = {
    key: "hide",
    label: "Hide",
    icon: { android: "visibility_off", ios: "eye.slash.fill" },
    className: "bg-[#8e8e93]",
    onPress: () =>
      void runAs(
        conversation.account,
        pds.messages.setShowInInbox({
          conversationId: conversation.id,
          show: false,
        }),
      ),
  } satisfies SwipeAction;
  const trailing = conversation.kind === "channel" ? [hide] : [];
  return { leading, trailing };
}
