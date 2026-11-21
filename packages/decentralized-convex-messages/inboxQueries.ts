import type { OperationArgs } from "@decentralized-convex/plugin";
import { queryResult } from "@decentralized-convex/server";

import type { QueryCtx } from "./_generated/server.js";
import type { messagesProtocol } from "./protocol.ts";
import { inboxRows } from "./inbox.ts";
import { listedAccess, inboxPage as pageOf } from "./inboxPages.ts";
import { inboxRowIncludes } from "./includes.ts";
import { findAccess } from "./model.ts";
import { LEGACY_INBOX_ROWS } from "./protocol.ts";
import { spaceReads } from "./spaceReads.ts";

// The inbox's lists, each with its rows included on its first answer (see
// `include` on the router): its subscription follows just the list, and
// each row is its own `conversation` query.

type Queries = (typeof messagesProtocol)["queries"];

/** Apps from before pages: the pins and newest `LEGACY_INBOX_ROWS`. */
export async function inboxConversations(
  ctx: QueryCtx,
  self: string,
  args: OperationArgs<Queries["inboxConversations"]>,
) {
  const spaces = spaceReads(ctx);
  const accesses = await listedAccess(
    ctx,
    self,
    { channels: args.channels === true, limit: LEGACY_INBOX_ROWS },
    spaces,
  );
  return queryResult(
    accesses.map(({ conversation }) => conversation.conversationId),
    {
      include: async () =>
        inboxRowIncludes(self, await inboxRows(ctx, self, accesses, spaces)),
    },
  );
}

/** One page of the inbox (see `inboxPage` in the protocol). */
export async function inboxPage(
  ctx: QueryCtx,
  self: string,
  args: OperationArgs<Queries["inboxPage"]>,
) {
  const spaces = spaceReads(ctx);
  const page = await pageOf(ctx, self, args, spaces);
  return queryResult(page, {
    include: async () => {
      const found = await Promise.all(
        [...page.pinned, ...page.conversationIds].map((conversationId) =>
          findAccess(ctx, conversationId, self, spaces),
        ),
      );
      return inboxRowIncludes(
        self,
        await inboxRows(
          ctx,
          self,
          found.filter((access) => access !== null),
          spaces,
        ),
      );
    },
  });
}
