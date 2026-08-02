import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { actorFromEmail, requireEnvironment } from "./lib";

export const list = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_room", (index) => index.eq("roomId", roomId))
      .collect();
    return messages.map(
      ({ author, authorName, body, eventId, origin, sentAt }) => ({
        author,
        authorName: authorName ?? author,
        body,
        eventId,
        origin,
        sentAt,
      }),
    );
  },
});

export const send = mutation({
  args: {
    body: v.string(),
    eventId: v.string(),
    roomId: v.string(),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    const body = args.body.trim();
    if (body.length === 0 || body.length > 4_000) {
      throw new Error("Messages must contain between 1 and 4,000 characters");
    }

    const user = await authComponent.getAuthUser(ctx);

    const existing = await ctx.db
      .query("messages")
      .withIndex("by_event", (index) => index.eq("eventId", args.eventId))
      .unique();
    if (existing === null) {
      await ctx.db.insert("messages", {
        author: actorFromEmail(user.email),
        authorName: user.name,
        body,
        eventId: args.eventId,
        origin: requireEnvironment("FEDERATION_DOMAIN").toLowerCase(),
        roomId: args.roomId,
        sentAt: args.sentAt,
      });
    }
    return { eventId: args.eventId };
  },
});
