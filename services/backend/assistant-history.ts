// Which of a conversation's messages an assistant's model sees
// (convex/agent.ts). The provider's prompt cache reuses a request only
// while the conversation in it grows at the end: a message changed or gone
// anywhere in it, even the first, makes the whole request full price. So
// the window doesn't slide one message per reply. Its first message stays
// put while it grows to `MAX_HISTORY`, then it moves on to the newest
// `HISTORY` in one jump, which the cache pays for once.

/** The fewest recent messages the model sees (when there are that many). */
export const HISTORY = 40;

/** The most it sees before the window moves on. */
export const MAX_HISTORY = 2 * HISTORY;

/**
 * The messages the model sees, oldest first, from `messages` (the newest
 * ones, oldest first, reaching back to `from` when there are that many):
 * those since `from`, the window's first message as of the last reply,
 * or the newest `HISTORY` when there's no `from` yet or the window has
 * grown past `MAX_HISTORY`. Returns them with the window's start.
 */
export function historyWindow<Message extends { readonly sentAt: number }>(
  messages: readonly Message[],
  from: number | null,
) {
  const first = messages.at(0);
  if (from !== null && first !== undefined && first.sentAt <= from) {
    const since = messages.filter((message) => message.sentAt >= from);
    const start = since.at(0);
    if (start !== undefined && since.length <= MAX_HISTORY) {
      return { from: start.sentAt, messages: since };
    }
  }
  const recent = messages.slice(-HISTORY);
  return { from: recent.at(0)?.sentAt ?? null, messages: recent };
}
