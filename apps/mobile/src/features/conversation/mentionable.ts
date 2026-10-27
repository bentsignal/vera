import type { Conversation } from "@decentralized-convex/messages";

import type { MentionCandidate } from "./mention-text.ts";
import { assistantsOf } from "../assistants/assistants.ts";

/**
 * Who you can @mention in a conversation: everyone in a group or channel
 * but you, and anywhere, Vera's assistants, which answer the message that
 * mentions them (unless it's already your direct message with one).
 */
export function mentionableIn(
  conversation: Pick<Conversation, "kind" | "members"> | undefined,
  self: string,
  profileOf: (accountId: string) => Omit<MentionCandidate, "accountId">,
) {
  if (conversation === undefined) return undefined;
  const { kind, members } = conversation;
  const assistants = assistantsOf(self);
  // Your direct message with an assistant answers every message anyway.
  if (kind === "direct" && members.some((id) => assistants.includes(id))) {
    return undefined;
  }
  return [
    ...(kind === "direct" ? [] : members.filter((member) => member !== self)),
    ...assistants.filter((assistant) => !members.includes(assistant)),
  ].map((accountId) => {
    const { avatarUrl, displayName } = profileOf(accountId);
    return { accountId, avatarUrl, displayName };
  });
}
