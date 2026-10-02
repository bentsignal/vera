import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel.js";
import { internal } from "./_generated/api.js";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server.js";
import { getConversation, getMember, memberAddresses } from "./model.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

/** Who to notify about a message, and what to show them. */
export const targets = internalQuery({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db
      .query("messages")
      .withIndex("by_message", (index) => index.eq("messageId", messageId))
      .unique();
    if (message === null) return null;
    const conversation = await getConversation(ctx, message.conversationId);
    if (conversation === null) return null;

    const tokens: string[] = [];
    for (const accountId of await memberAddresses(ctx, conversation)) {
      if (accountId === message.authorId) continue;
      const member = await getMember(
        ctx,
        conversation.conversationId,
        accountId,
      );
      if (member?.muted === true) continue;
      const rows = await ctx.db
        .query("pushTokens")
        .withIndex("by_account", (index) => index.eq("accountId", accountId))
        .collect();
      tokens.push(...rows.map((row) => row.token));
    }
    return {
      body: previewText(message),
      conversationId: conversation.conversationId,
      kind: conversation.kind,
      title: await title(ctx, conversation, message),
      tokens,
    };
  },
});

export const send = internalAction({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }) => {
    const target = await ctx.runQuery(internal.notifications.targets, {
      messageId,
    });
    if (target === null || target.tokens.length === 0) return;

    for (
      let start = 0;
      start < target.tokens.length;
      start += EXPO_BATCH_SIZE
    ) {
      const batch = target.tokens.slice(start, start + EXPO_BATCH_SIZE);
      const response = await fetch(EXPO_PUSH_URL, {
        body: JSON.stringify(
          batch.map((to) => ({
            body: target.body,
            data: {
              conversationId: target.conversationId,
              kind: target.kind,
            },
            sound: "default",
            threadId: target.conversationId,
            title: target.title,
            to,
          })),
        ),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      if (!response.ok) {
        console.error("Expo push request failed", response.status);
        continue;
      }
      const errors = parseTicketErrors(await response.json());
      const expired = batch.filter(
        (_, index) => errors[index] === "DeviceNotRegistered",
      );
      if (expired.length > 0) {
        await ctx.runMutation(internal.notifications.removeTokens, {
          tokens: expired,
        });
      }
    }
  },
});

export const removeTokens = internalMutation({
  args: { tokens: v.array(v.string()) },
  handler: async (ctx, { tokens }) => {
    for (const token of tokens) {
      const row = await ctx.db
        .query("pushTokens")
        .withIndex("by_token", (index) => index.eq("token", token))
        .unique();
      if (row !== null) await ctx.db.delete(row._id);
    }
  },
});

/** Each ticket's error code, if any, in request order. */
function parseTicketErrors(body: unknown): (string | undefined)[] {
  if (typeof body !== "object" || body === null || !("data" in body)) return [];
  const { data } = body;
  if (!Array.isArray(data)) return [];
  return data.map((ticket: unknown) => {
    if (typeof ticket !== "object" || ticket === null) return undefined;
    if (!("details" in ticket)) return undefined;
    const { details } = ticket;
    if (typeof details !== "object" || details === null) return undefined;
    return "error" in details && typeof details.error === "string"
      ? details.error
      : undefined;
  });
}

function previewText(message: Doc<"messages">) {
  if (message.body.length > 0) return message.body.slice(0, 200);
  const [first] = message.attachments;
  if (first === undefined) return "";
  const count = message.attachments.length;
  const noun = { file: "file", image: "photo", video: "video" }[first.kind];
  return count === 1 ? `Sent a ${noun}` : `Sent ${count} attachments`;
}

async function title(
  ctx: Parameters<typeof getConversation>[0],
  conversation: Doc<"conversations">,
  message: Doc<"messages">,
) {
  if (conversation.kind === "direct") return message.authorName;
  if (conversation.kind === "group") {
    return `${message.authorName} in ${conversation.name ?? "a group"}`;
  }
  const space =
    conversation.spaceId === undefined
      ? null
      : await ctx.db
          .query("spaces")
          .withIndex("by_space", (index) =>
            index.eq("spaceId", conversation.spaceId ?? ""),
          )
          .unique();
  const channel = `#${conversation.name ?? "channel"}`;
  return `${message.authorName} in ${space === null ? channel : `${space.name} ${channel}`}`;
}
