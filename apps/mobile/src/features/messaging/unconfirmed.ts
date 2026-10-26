// Which of this device's sends show below a window's messages, because its
// pages don't list them yet.

interface Send {
  readonly messageId: string;
  readonly sentAt: number;
  readonly status: "failed" | "sending" | "sent";
}

interface Window {
  /**
   * At the latest messages, following new ones (see `advance`), even while
   * its newest page is full and the next is still loading.
   */
  readonly live: boolean;
  readonly hasOlder: boolean;
  /** Oldest first. */
  readonly messages: readonly { messageId: string; sentAt: number }[];
}

/**
 * The sends that show after the window's messages: only at the latest
 * messages, and only those its pages don't list. The outbox keeps sends
 * the PDS took (for their local media), and one older than the window's
 * oldest message is on a page that hasn't loaded, not one still on its
 * way, so it shows there once that page loads instead of at the bottom.
 * One still sending or that failed always shows, so it can be retried.
 */
export function unconfirmedSends<Sent extends Send>(
  outbox: readonly Sent[],
  window: Window,
) {
  if (!window.live) return [];
  const listed = new Set(window.messages.map((message) => message.messageId));
  const start = window.hasOlder ? window.messages[0]?.sentAt : undefined;
  return outbox.filter(
    (message) =>
      !listed.has(message.messageId) &&
      (message.status !== "sent" ||
        start === undefined ||
        message.sentAt >= start),
  );
}
