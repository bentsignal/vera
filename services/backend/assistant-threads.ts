// Threads in a DM with an assistant (convex/agent.ts). Each thread is a
// conversation of its own: a message kept in a thread is answered there,
// from what that thread says, apart from the main chat and other threads.

interface Sent {
  readonly threadId?: string;
  readonly threadOnly?: boolean;
}

/**
 * The thread a sent message is answered in: its thread when it was kept
 * there (sent from the thread page), or null for the conversation, which
 * also answers replies sent from the conversation.
 */
export function replyThread({ threadId, threadOnly }: Sent) {
  return threadOnly === true && threadId !== undefined ? threadId : null;
}

interface ThreadMessage {
  readonly quote?: { readonly messageId?: string };
}

/**
 * One page of a thread as the assistant reads it, oldest first: its
 * replies, after the original they answer once the page reaches the
 * start. A reply quoting the original says nothing the original doesn't,
 * so its quote is left off.
 */
export function threadMessages<Message extends ThreadMessage>(
  threadId: string,
  {
    hasOlder,
    messages,
    root,
  }: {
    readonly hasOlder: boolean;
    readonly messages: readonly Message[];
    readonly root: Message | null;
  },
): Message[] {
  const replies = messages.map((message) => {
    if (message.quote?.messageId !== threadId) return message;
    const { quote: _, ...rest } = message;
    return rest as Message;
  });
  return hasOlder || root === null ? replies : [root, ...replies];
}
