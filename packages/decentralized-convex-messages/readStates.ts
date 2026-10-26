import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { ConversationAccess } from "./model.ts";

// How far each account has read each conversation (`readStates`), apart
// from its member row, which every query in the conversation reads.

function readStateOf(ctx: QueryCtx, conversationId: string, accountId: string) {
  return ctx.db
    .query("readStates")
    .withIndex("by_conversation_account", (index) =>
      index.eq("conversationId", conversationId).eq("accountId", accountId),
    )
    .unique();
}

/**
 * How far the account has read the conversation, given how far it had
 * read before `readStates` (see `readBefore`).
 */
export async function readAt(
  ctx: QueryCtx,
  conversationId: string,
  accountId: string,
  readBefore: number,
) {
  const state = await readStateOf(ctx, conversationId, accountId);
  return Math.max(state?.lastReadAt ?? 0, readBefore);
}

/** How far the account has read the conversation. */
export function readPosition(
  ctx: QueryCtx,
  access: ConversationAccess,
  accountId: string,
) {
  return readAt(
    ctx,
    access.conversation.conversationId,
    accountId,
    access.readBefore,
  );
}

/**
 * Moves how far the account has read the conversation up to `readAt`.
 * Its own row, so moving it reruns only queries that show read state, and
 * two people reading or sending at once never touch the same document.
 */
export async function markReadUpTo(
  ctx: MutationCtx,
  access: ConversationAccess,
  accountId: string,
  readAt: number,
) {
  const { conversationId } = access.conversation;
  const state = await readStateOf(ctx, conversationId, accountId);
  if (readAt <= Math.max(state?.lastReadAt ?? 0, access.readBefore)) return;
  if (state === null) {
    await ctx.db.insert("readStates", {
      accountId,
      conversationId,
      lastReadAt: readAt,
    });
  } else {
    await ctx.db.patch(state._id, { lastReadAt: readAt });
  }
}
