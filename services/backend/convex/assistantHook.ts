import type { PdsRouterMutation } from "@decentralized-convex/server";

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { BotAccount } from "./bots";
import { internal } from "./_generated/api";
import {
  ASSISTANTS,
  botAccount,
  botAddress,
  field,
  queryAsBot,
  VERA,
} from "./bots";

// What starts an assistant's work: the PDS router's `afterMutation`
// (pds.ts) sees every write someone on this PDS makes, and reacts to the
// ones in a direct conversation with an assistant.

/** How long a reply waits for more messages, so a burst gets one answer. */
const REPLY_DELAY = 1500;

/**
 * The router's `afterMutation` (pds.ts): when someone on this PDS sends a
 * direct message to an assistant, its reply runs after a short pause. A
 * newer message moves the reply later, so it answers them together.
 */
export async function afterPdsMutation(
  ctx: MutationCtx,
  { identity, operation, plugin }: PdsRouterMutation,
) {
  if (plugin !== "messages" || identity === null) return;
  const type = field(operation, "type");
  const conversationId = field(field(operation, "args"), "conversationId");
  if (typeof conversationId !== "string") return;
  if (!conversationId.startsWith("direct:")) return;
  if (type === "editMessage" || type === "deleteMessage") {
    await forgetChangedMessage(ctx, conversationId, operation);
    return;
  }
  if (type !== "send" || identity.accountId === undefined) return;
  await startReply(ctx, conversationId, identity.accountId);
}

/** Schedules an assistant's reply to someone's direct message to it. */
async function startReply(
  ctx: MutationCtx,
  conversationId: string,
  author: string,
) {
  const members = conversationId.slice("direct:".length).split(":");
  if (!members.includes(author)) return;
  const bot = ASSISTANTS.find(
    (candidate) =>
      botAddress(candidate) !== author &&
      members.includes(botAddress(candidate)),
  );
  if (bot === undefined) return;
  await scheduleReply(ctx, {
    accountId: author,
    bot: bot.username,
    conversationId,
    wakeAt: Date.now() + REPLY_DELAY,
  });
}

/**
 * Has the assistant reply in a conversation at `wakeAt`, optionally with a
 * note from the team (agent.ts `teamNote`). A later call moves the reply
 * later.
 */
export async function scheduleReply(
  ctx: MutationCtx,
  {
    accountId,
    bot,
    conversationId,
    note,
    wakeAt,
  }: {
    accountId: string;
    bot: BotAccount["username"];
    conversationId: string;
    note?: string;
    wakeAt: number;
  },
) {
  const existing = await ctx.db
    .query("botConversations")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .unique();
  const update = {
    ...(note !== undefined && { note }),
    waitingSince: undefined,
    wakeAt,
  };
  if (existing === null) {
    await ctx.db.insert("botConversations", {
      ...update,
      accountId,
      bot,
      conversationId,
    });
  } else {
    await ctx.db.patch(existing._id, update);
  }
  await ctx.scheduler.runAt(wakeAt, internal.agent.run, {
    conversationId,
    wakeAt,
  });
}

/**
 * An edited or deleted message in a DM with Vera: its memory passage is
 * rebuilt from what the conversation says now (memory.ts).
 */
async function forgetChangedMessage(
  ctx: MutationCtx,
  conversationId: string,
  operation: unknown,
) {
  if (!conversationId.split(":").includes(botAddress(VERA))) return;
  const messageId = field(field(operation, "args"), "messageId");
  if (typeof messageId !== "string") return;
  await ctx.scheduler.runAfter(0, internal.memoryBuild.rebuild, { messageId });
}

/** How often a reply checks whether they've stopped typing, and for how long. */
const TYPING_RECHECK = 2500;
const MAX_TYPING_WAIT = 30_000;

/**
 * Holds a reply while the person is typing, like someone letting the other
 * finish: pushes its wake-up a few seconds later and returns true. Gives up
 * waiting after 30 seconds, in case typing never clears.
 */
export async function waitWhileTyping(
  ctx: MutationCtx,
  row: Doc<"botConversations">,
  now: number,
) {
  if (
    row.waitingSince !== undefined &&
    now - row.waitingSince >= MAX_TYPING_WAIT
  ) {
    return false;
  }
  const response = await queryAsBot(ctx, botAccount(row.bot), {
    args: { conversationId: row.conversationId },
    type: "typing",
  });
  const typing =
    response.type === "typing" &&
    response.value.some((typist) => typist.accountId === row.accountId);
  if (!typing) return false;
  const wakeAt = now + TYPING_RECHECK;
  await ctx.db.patch(row._id, {
    wakeAt,
    waitingSince: row.waitingSince ?? now,
  });
  await ctx.scheduler.runAt(wakeAt, internal.agent.run, {
    conversationId: row.conversationId,
    wakeAt,
  });
  return true;
}
