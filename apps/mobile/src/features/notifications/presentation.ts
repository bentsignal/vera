export interface ConversationOnScreen {
  readonly accountId: string;
  readonly conversationId: string;
}

export interface NotificationTarget {
  readonly accountId?: string;
  readonly conversationId?: string;
  readonly threadId?: string;
  readonly kind?: string;
}

export interface NotificationScreen {
  readonly foreground: boolean;
  readonly conversation?: ConversationOnScreen;
  readonly reactionSheet?: ConversationOnScreen;
  readonly thread?: ConversationOnScreen & { readonly threadId: string };
  readonly inbox: boolean;
  readonly activity: boolean;
}

function sameAccount(target: NotificationTarget, screen: ConversationOnScreen) {
  // Older pushes omitted the account. Conversation IDs still identify them.
  return (
    target.accountId === undefined || target.accountId === screen.accountId
  );
}

function sameConversation(
  target: NotificationTarget,
  screen: ConversationOnScreen | undefined,
) {
  return (
    screen !== undefined &&
    target.conversationId === screen.conversationId &&
    sameAccount(target, screen)
  );
}

/** Presentation only: Activity records and server delivery are unchanged. */
export function notificationIsNews(
  target: NotificationTarget,
  screen: NotificationScreen,
) {
  if (!screen.foreground || target.conversationId === undefined) return true;
  if (target.kind === "reaction") {
    return (
      !screen.activity &&
      ![screen.conversation, screen.reactionSheet, screen.thread].some(
        (shown) => sameConversation(target, shown),
      )
    );
  }
  if (target.threadId !== undefined) {
    const thread = screen.thread;
    return (
      !screen.activity &&
      !(target.threadId === thread?.threadId && sameAccount(target, thread))
    );
  }
  return !screen.inbox && !sameConversation(target, screen.conversation);
}
