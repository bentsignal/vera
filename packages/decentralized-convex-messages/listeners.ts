import type { Doc } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import type { AlertLevel } from "./protocol.ts";
import type { AccountSettings } from "./settings.ts";
import { alerts, alertsFor } from "./alerts.ts";
import { findAccess } from "./model.ts";
import { notificationSettings } from "./settings.ts";
import { threadMember, threadMembers } from "./threads.ts";

/**
 * What a push about a reply says it is: a reply to the recipient's own
 * message, or one in a thread they're in. Null for a plain message push.
 */
export type ReplyPush = "thread" | "yours" | null;

/** Someone who hears about a message, and as what. */
export interface Listener {
  readonly accountId: string;
  readonly reply: ReplyPush;
}

/**
 * What a conversation alerts an account about, and their settings; null
 * when it alerts them about nothing (or they have pushes off).
 */
async function hearing(
  ctx: QueryCtx,
  conversationId: string,
  accountId: string,
) {
  const access = await findAccess(ctx, conversationId, accountId);
  if (access === null) return null;
  const settings = await notificationSettings(ctx, accountId);
  const level = alertsFor(access, settings);
  return level === "none" || !settings.enabled ? null : { level, settings };
}

function mentions(message: Doc<"messages">, accountId: string) {
  return alerts("mentions", message, accountId);
}

/**
 * Whether a member hears of a message in the conversation as a message:
 * it alerts them (everything, or one that @mentions them), and for a
 * direct message they have those on.
 */
function hearsMessage(
  conversation: Doc<"conversations">,
  message: Doc<"messages">,
  accountId: string,
  { level, settings }: { level: AlertLevel; settings: AccountSettings },
) {
  if (!alerts(level, message, accountId)) return false;
  return conversation.kind !== "direct" || settings.directMessages;
}

/**
 * What a member hears of a message in the conversation: a reply to their
 * message, the message, or (undefined) nothing.
 */
async function chatPush(
  ctx: QueryCtx,
  message: Doc<"messages">,
  conversation: Doc<"conversations">,
  accountId: string,
): Promise<ReplyPush | undefined> {
  const found = await hearing(ctx, conversation.conversationId, accountId);
  if (found === null) return undefined;
  if (
    message.threadId !== undefined &&
    message.quote?.authorId === accountId &&
    found.settings.replies
  ) {
    // The original's author turned the thread's bell off before anyone
    // replied: they hear of the reply only as a message.
    const member = await threadMember(ctx, message.threadId, accountId);
    if (member?.unfollowed !== true) return "yours";
  }
  return hearsMessage(conversation, message, accountId, found)
    ? null
    : undefined;
}

/**
 * What someone hears of a reply kept in its thread: as a reply to their
 * message, as a thread reply, or (undefined) nothing. People in the
 * thread hear of it at any level but `none`, unless they turned the
 * thread's bell off; anyone it @mentions hears of it as well.
 */
async function threadPush(
  ctx: QueryCtx,
  message: Doc<"messages">,
  accountId: string,
  member: Doc<"threadMembers"> | null,
): Promise<ReplyPush | undefined> {
  const found = await hearing(ctx, message.conversationId, accountId);
  if (found === null) return undefined;
  const mentioned = mentions(message, accountId);
  if (member === null || member.unfollowed === true) {
    return mentioned ? "thread" : undefined;
  }
  const yours = accountId === message.quote?.authorId;
  const wanted = yours ? found.settings.replies : found.settings.threadReplies;
  if (!wanted && !mentioned) return undefined;
  return yours ? "yours" : "thread";
}

/** The people who hear about a reply kept in its thread. */
async function threadListeners(
  ctx: QueryCtx,
  message: Doc<"messages">,
  threadId: string,
  members: readonly string[],
) {
  const inThread = new Map(
    (await threadMembers(ctx, threadId)).map((member) => [
      member.accountId,
      member,
    ]),
  );
  const mentioned = (message.mentions ?? [])
    .map(({ accountId }) => accountId)
    .filter((accountId) => members.includes(accountId));
  const heard = new Array<Listener>();
  for (const accountId of new Set([...inThread.keys(), ...mentioned])) {
    if (accountId === message.authorId) continue;
    const member = inThread.get(accountId) ?? null;
    const reply = await threadPush(ctx, message, accountId, member);
    if (reply !== undefined) heard.push({ accountId, reply });
  }
  return heard;
}

/** Each account in a reply's thread; none for a message that isn't one. */
async function threadMembersOf(ctx: QueryCtx, message: Doc<"messages">) {
  if (message.threadId === undefined) {
    return new Map<string, Doc<"threadMembers">>();
  }
  return new Map(
    (await threadMembers(ctx, message.threadId)).map((member) => [
      member.accountId,
      member,
    ]),
  );
}

/**
 * Who hears about a message, and as what. A message in the conversation
 * (a reply sent from there included) goes to the members it alerts; the
 * author of the message a reply answers hears of it as a reply to their
 * message at any level but `none`, unless they turned those off, and
 * anyone else in its thread whom it doesn't alert hears of it as a thread
 * reply. A reply kept in its thread goes to the people in the thread (see
 * `threadPush`).
 */
export async function listeners(
  ctx: QueryCtx,
  message: Doc<"messages">,
  conversation: Doc<"conversations">,
  members: readonly string[],
) {
  if (message.threadOnly === true && message.threadId !== undefined) {
    return threadListeners(ctx, message, message.threadId, members);
  }
  const inThread = await threadMembersOf(ctx, message);
  const heard = new Array<Listener>();
  for (const accountId of members) {
    if (accountId === message.authorId) continue;
    const asMessage = await chatPush(ctx, message, conversation, accountId);
    const member = inThread.get(accountId);
    const reply =
      asMessage === undefined && member !== undefined
        ? await threadPush(ctx, message, accountId, member)
        : asMessage;
    if (reply !== undefined) heard.push({ accountId, reply });
  }
  return heard;
}

/**
 * The members who'd hear of a message only if it says their display name:
 * they turned those pushes on, it doesn't reach them already (`heard`),
 * and it would as an @mention. The caller checks their names, which live
 * in Accounts (see `accountProfile`).
 */
export async function nameListeners(
  ctx: QueryCtx,
  message: Doc<"messages">,
  conversation: Doc<"conversations">,
  members: readonly string[],
  heard: readonly Listener[],
) {
  if (message.body.length === 0) return [];
  const reached = new Set(heard.map(({ accountId }) => accountId));
  const wanting = new Set<string>();
  for (const accountId of members) {
    if (accountId === message.authorId || reached.has(accountId)) continue;
    const settings = await notificationSettings(ctx, accountId);
    if (settings.enabled && settings.yourName) wanting.add(accountId);
  }
  if (wanting.size === 0) return [];
  const asMentioned = {
    ...message,
    mentions: [...wanting].map((accountId) => ({ accountId, name: "" })),
  };
  const named = await listeners(ctx, asMentioned, conversation, [...wanting]);
  return named.filter(({ accountId }) => wanting.has(accountId));
}
