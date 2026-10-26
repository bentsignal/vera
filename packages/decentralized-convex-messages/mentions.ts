import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { ConversationAccess } from "./model.ts";
import type { Mention, Said } from "./protocol.ts";
import { alertsFor, mentionedBy } from "./alerts.ts";
import { fail, findAccess, memberAddresses } from "./model.ts";
import { MAX_MENTIONS } from "./protocol.ts";
import { notificationSettings } from "./settings.ts";

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
 * Whether a message's text says a display name or keyword: all of it, in
 * any case, not inside a longer word ("Maya" isn't in "Mayan").
 */
export function saysWord(text: string, word: string) {
  const wanted = word.trim();
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
 * Which of a member's words a message may say: a keyword of theirs, their
 * name if they want to hear of it (for the caller to check), or nothing
 * (null), as from a conversation at `none`.
 */
async function wordsOf(
  ctx: QueryCtx,
  message: Doc<"messages">,
  accountId: string,
): Promise<Said | null> {
  const settings = await notificationSettings(ctx, accountId);
  const access = await findAccess(ctx, message.conversationId, accountId);
  if (access === null || alertsFor(access, settings) === "none") return null;
  const keyword = settings.keywords.find((word) =>
    saysWord(message.body, word),
  );
  if (keyword !== undefined) return { keyword, kind: "keyword" };
  return settings.yourName ? { kind: "name" } : null;
}

/**
 * The members a new message would count as @mentioning for the words it
 * says (see `noteWords`): those it says a keyword of (`keywords`), and
 * those who want to hear of their name (`names`), which the caller checks,
 * since names live in Accounts (see `accountProfile`). Not its author or
 * anyone it @mentions, and none in a direct message, where every message
 * reaches you anyway, nor anyone a conversation at `none` reaches with
 * nothing. Nobody once it's been worked out.
 */
export async function wordCandidates(
  ctx: QueryCtx,
  message: Doc<"messages">,
  conversation: Doc<"conversations">,
  members: readonly string[],
) {
  const keywords = new Array<{ accountId: string; keyword: string }>();
  const names = new Array<string>();
  if (
    conversation.kind === "direct" ||
    message.body.length === 0 ||
    message.saidTo !== undefined
  ) {
    return { keywords, names };
  }
  const skipped = new Set([message.authorId, ...mentionedBy(message)]);
  for (const accountId of members.filter((id) => !skipped.has(id))) {
    const said = await wordsOf(ctx, message, accountId);
    if (said === null) continue;
    if (said.kind === "name") names.push(accountId);
    else keywords.push({ accountId, keyword: said.keyword });
  }
  return { keywords, names };
}

type Mentioned = Pick<
  Doc<"messages">,
  "conversationId" | "messageId" | "sentAt" | "threadId" | "threadOnly"
>;

/** Notes that a message mentions an account (or says their words). */
async function recordMention(
  ctx: MutationCtx,
  message: Mentioned,
  accountId: string,
  said?: Said,
) {
  await ctx.db.insert("mentions", {
    accountId,
    conversationId: message.conversationId,
    messageId: message.messageId,
    said,
    sentAt: message.sentAt,
    threadId: message.threadOnly === true ? message.threadId : undefined,
  });
}

/**
 * Counts a message as @mentioning the accounts whose name or keyword it
 * says, once: their pushes and activity treat it as a mention from then
 * on. A message deleted meanwhile is left alone.
 */
export async function noteWordsSaid(
  ctx: MutationCtx,
  messageId: string,
  said: readonly { accountId: string; said: Said }[],
) {
  const message = await ctx.db
    .query("messages")
    .withIndex("by_message", (index) => index.eq("messageId", messageId))
    .unique();
  if (
    message === null ||
    message.deletedAt !== undefined ||
    message.saidTo !== undefined
  ) {
    return;
  }
  await ctx.db.patch(message._id, {
    saidTo: said.map(({ accountId }) => accountId),
  });
  for (const { accountId, said: why } of said) {
    await recordMention(ctx, message, accountId, why);
  }
}

/**
 * Notes each account a new message mentions, for their activity, and its
 * thread when it's a reply kept there (reading the thread sees it). One
 * already noted for the words it says is left as it is.
 */
export async function recordMentions(
  ctx: MutationCtx,
  message: Mentioned & {
    mentions?: readonly Mention[];
    saidTo?: readonly string[];
  },
) {
  const noted = new Set(message.saidTo);
  const mentioned = new Set(
    (message.mentions ?? []).map(({ accountId }) => accountId),
  );
  for (const accountId of mentioned) {
    if (!noted.has(accountId)) await recordMention(ctx, message, accountId);
  }
}
