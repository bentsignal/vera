import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { ConversationAccess } from "./model.ts";
import type { Mention } from "./protocol.ts";
import { fail, memberAddresses } from "./model.ts";
import { MAX_MENTIONS } from "./protocol.ts";

const MAX_MENTION_NAME_LENGTH = 80;

/** Whether a mention's name is one, and the body has its `@name`. */
function isWritten(name: string, body: string) {
  return (
    name.length > 0 &&
    name.length <= MAX_MENTION_NAME_LENGTH &&
    body.includes(`@${name}`)
  );
}

/**
 * Whether a message's text says a display name: the whole name, in any
 * case, not inside a longer word ("Maya" isn't in "Mayan").
 */
export function saysName(text: string, name: string) {
  const wanted = name.trim();
  if (wanted.length === 0) return false;
  const escaped = wanted.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(
    String.raw`(?<![\p{L}\p{N}])${escaped}(?![\p{L}\p{N}])`,
    "iu",
  ).test(text);
}

/**
 * The mentions that hold: of members other than the author whose `@name`
 * is in the body, each once; undefined when none do. Direct messages have
 * none.
 */
export async function validMentions(
  ctx: QueryCtx,
  access: ConversationAccess,
  self: string,
  body: string,
  mentions: readonly Mention[] | undefined,
) {
  if (mentions === undefined || access.conversation.kind === "direct") {
    return undefined;
  }
  if (mentions.length > MAX_MENTIONS) fail("TOO_MANY_MENTIONS");
  const members = new Set(await memberAddresses(ctx, access.conversation));
  const kept = new Map<string, Mention>();
  for (const { accountId: address, name: written } of mentions) {
    const mention = {
      accountId: address.trim().toLowerCase(),
      name: written.trim(),
    };
    if (mention.accountId === self || !members.has(mention.accountId)) continue;
    if (isWritten(mention.name, body)) {
      kept.set(`${mention.accountId} ${mention.name}`, mention);
    }
  }
  return kept.size > 0 ? [...kept.values()] : undefined;
}

/**
 * Notes each account a new message mentions, for their activity, and its
 * thread when it's a reply kept there (reading the thread sees it).
 */
export async function recordMentions(
  ctx: MutationCtx,
  message: {
    conversationId: string;
    mentions?: readonly Mention[];
    messageId: string;
    sentAt: number;
    threadId?: string;
    threadOnly?: boolean;
  },
) {
  const mentioned = new Set(
    (message.mentions ?? []).map(({ accountId }) => accountId),
  );
  for (const accountId of mentioned) {
    await ctx.db.insert("mentions", {
      accountId,
      conversationId: message.conversationId,
      messageId: message.messageId,
      sentAt: message.sentAt,
      threadId: message.threadOnly === true ? message.threadId : undefined,
    });
  }
}
