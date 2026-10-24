import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import type { ConversationAccess } from "./model.ts";

// When a conversation last changed, for apps' saved copies of it
// (`changedAt`), kept apart from the conversation itself, which every query
// in it reads (`conversationChanges`).

function changesOf(ctx: QueryCtx, conversationId: string) {
  return ctx.db
    .query("conversationChanges")
    .withIndex("by_conversation", (index) =>
      index.eq("conversationId", conversationId),
    )
    .unique();
}

/**
 * Notes that a reaction, edit, or deletion changed what the conversation
 * shows (`changedAt`), so apps know a copy of it they saved is out of
 * date. New messages don't need noting: they're the newest message.
 */
export async function markChanged(
  ctx: MutationCtx,
  access: ConversationAccess,
  at = Date.now(),
) {
  const { conversationId } = access.conversation;
  const changes = await changesOf(ctx, conversationId);
  if (changes === null) {
    await ctx.db.insert("conversationChanges", {
      changedAt: at,
      conversationId,
    });
  } else if (at > changes.changedAt) {
    await ctx.db.patch(changes._id, { changedAt: at });
  }
}

/**
 * When the conversation last changed: its newest message (a reply kept in
 * its thread included), or a reaction, edit, or deletion since.
 */
export async function changedAtOf(
  ctx: QueryCtx,
  conversation: Doc<"conversations">,
) {
  const [changes, newest] = await Promise.all([
    changesOf(ctx, conversation.conversationId),
    ctx.db
      .query("messages")
      .withIndex("by_conversation_sent", (index) =>
        index.eq("conversationId", conversation.conversationId),
      )
      .order("desc")
      .first(),
  ]);
  const at = Math.max(
    conversation.changedAt ?? 0,
    changes?.changedAt ?? 0,
    newest?.sentAt ?? 0,
  );
  return at === 0 ? undefined : at;
}
