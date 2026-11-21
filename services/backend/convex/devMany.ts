import { v } from "convex/values";

import { internalAction } from "./_generated/server";
import {
  asAccount,
  botAddress,
  identityFor,
  pick,
  REPLIES,
  requireDevTools,
  stringField,
} from "./devBots";

// Development only: an inbox longer than a page (`INBOX_PAGE_SIZE`), for
// trying how the inbox loads more as it scrolls. Run from the CLI:
// `npx convex run devMany:seed '{"username":"ios","count":80}'`.

export const seed = internalAction({
  args: { count: v.number(), username: v.string() },
  handler: async (ctx, { count, username }) => {
    requireDevTools();
    const me = botAddress(username);
    for (let index = 0; index < count; index += 1) {
      const name = `Pen Pal ${index + 1}`;
      const pal = identityFor(botAddress(`penpal${index + 1}`), name);
      const conversationId = stringField(
        await asAccount(ctx, pal, {
          args: { accountId: me },
          type: "openDirect",
        }),
        "conversationId",
      );
      await asAccount(ctx, pal, {
        args: {
          attachments: [],
          body: pick(REPLIES, index * 13 + 5),
          conversationId,
          messageId: crypto.randomUUID(),
        },
        type: "send",
      });
    }
    return { count };
  },
});

/**
 * Adds the pen pals `seed` made to a space, so its member list is longer
 * than a page (`SPACE_PAGE_SIZE`). `owner` is a member's username.
 * `npx convex run devMany:joinSpace '{"spaceId":"…","owner":"leo","count":80}'`.
 */
export const joinSpace = internalAction({
  args: { count: v.number(), owner: v.string(), spaceId: v.string() },
  handler: async (ctx, { count, owner, spaceId }) => {
    requireDevTools();
    const members = Array.from({ length: count }, (_, index) =>
      botAddress(`penpal${index + 1}`),
    );
    await asAccount(ctx, identityFor(botAddress(owner), owner), {
      args: { members, spaceId },
      type: "addSpaceMembers",
    });
    return { count };
  },
});
