import type { QueryCtx } from "./_generated/server.js";
import { inboxAccess } from "./inbox.ts";
import { hasUnread, pendingInvites } from "./model.ts";

/**
 * The app icon badge for one account, counted the way an inbox-and-spaces
 * app counts its tab badges: each inbox conversation (direct messages,
 * groups, and the channels shown in the inbox) with anything unread, plus
 * each pending space invitation. Muted conversations count, as they do in
 * the inbox.
 *
 * Only this PDS's conversations and invitations are counted, and a push
 * carries only its own account's count. A device signed into several
 * accounts shows the sum once the app is open.
 */
export async function badgeCount(ctx: QueryCtx, accountId: string) {
  let count = 0;
  for (const access of await inboxAccess(ctx, accountId, true)) {
    const { conversationId } = access.conversation;
    if (await hasUnread(ctx, conversationId, accountId, access.lastReadAt)) {
      count += 1;
    }
  }
  return count + (await pendingInvites(ctx, accountId)).length;
}
