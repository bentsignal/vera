import { ConvexError, v } from "convex/values";

import type { QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";

// Leaves out 0, 1, I, L, O, and U so codes are easy to read and retype.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_GROUP_LENGTH = 4;

/** Uppercases and strips separators so `k7qm 3xpd` matches `K7QM-3XPD`. */
export function normalizeInviteCode(code: string) {
  const compact = code.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return compact.length === CODE_GROUP_LENGTH * 2
    ? `${compact.slice(0, CODE_GROUP_LENGTH)}-${compact.slice(CODE_GROUP_LENGTH)}`
    : compact;
}

function generateInviteCode() {
  const bytes = new Uint8Array(CODE_GROUP_LENGTH * 2);
  crypto.getRandomValues(bytes);
  const characters = [...bytes].map(
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  );
  return normalizeInviteCode(characters.join(""));
}

async function findInviteCode(ctx: QueryCtx, code: string) {
  return ctx.db
    .query("inviteCodes")
    .withIndex("by_code", (index) =>
      index.eq("code", normalizeInviteCode(code)),
    )
    .unique();
}

/**
 * The code if a sign-up may use it right now, with the one username it
 * signs up (null when any username may use it).
 */
export const findActive = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const invite = await findInviteCode(ctx, code);
    return invite?.active === true
      ? { username: invite.username ?? null }
      : null;
  },
});

/** Records a completed sign-up. Fails if the code was deactivated meanwhile. */
export const redeem = internalMutation({
  args: { accountId: v.string(), code: v.string() },
  handler: async (ctx, { accountId, code }) => {
    const invite = await findInviteCode(ctx, code);
    if (invite?.active !== true) {
      throw new ConvexError({ code: "INVITE_CODE_INACTIVE" });
    }
    await ctx.db.insert("inviteRedemptions", { accountId, code: invite.code });
  },
});

/**
 * Operator command: `npx convex run invites:create '{"label":"..."}'`.
 * With `username`, the code signs up only that username, even a reserved
 * one such as `support`, so the operator can claim it.
 */
export const create = internalMutation({
  args: { label: v.optional(v.string()), username: v.optional(v.string()) },
  handler: async (ctx, { label, username }) => {
    const claimed = username?.trim().toLowerCase();
    for (;;) {
      const code = generateInviteCode();
      if ((await findInviteCode(ctx, code)) !== null) continue;
      await ctx.db.insert("inviteCodes", {
        active: true,
        code,
        label,
        username: claimed,
      });
      return code;
    }
  },
});

/** Operator command: `npx convex run invites:deactivate '{"code":"..."}'`. */
export const deactivate = internalMutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const invite = await findInviteCode(ctx, code);
    if (invite === null) {
      throw new ConvexError({ code: "INVITE_CODE_NOT_FOUND" });
    }
    if (invite.active) {
      await ctx.db.patch(invite._id, {
        active: false,
        deactivatedAt: Date.now(),
      });
    }
    return invite.code;
  },
});

/** Operator command: `npx convex run invites:list`. */
export const list = internalQuery({
  args: {},
  handler: async (ctx) => {
    const invites = await ctx.db.query("inviteCodes").order("desc").collect();
    return Promise.all(
      invites.map(async (invite) => {
        const redemptions = await ctx.db
          .query("inviteRedemptions")
          .withIndex("by_code", (index) => index.eq("code", invite.code))
          .collect();
        return {
          accounts: redemptions.map((redemption) => redemption.accountId),
          active: invite.active,
          code: invite.code,
          createdAt: invite._creationTime,
          deactivatedAt: invite.deactivatedAt ?? null,
          label: invite.label ?? null,
          username: invite.username ?? null,
        };
      }),
    );
  },
});
