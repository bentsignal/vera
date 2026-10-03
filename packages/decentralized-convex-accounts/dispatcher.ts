import { defineComponentDispatchers } from "@decentralized-convex/server";
import { ConvexError } from "convex/values";

import type { QueryCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import { accountsProtocol, PROFILE_BIO_MAX_LENGTH } from "./protocol.ts";

export const { dispatchMutation, dispatchQuery } = defineComponentDispatchers({
  handlers: {
    mutations: {
      upsertMyProfile: async (ctx, { args, identity }) => {
        const accountId = requireAccountId(identity);
        const displayName = args.displayName.trim();
        if (displayName.length === 0 || displayName.length > 80) {
          throw new ConvexError({ code: "INVALID_DISPLAY_NAME" });
        }
        const existing = await ctx.db
          .query("profiles")
          .withIndex("by_account", (index) => index.eq("accountId", accountId))
          .unique();
        const savedBio = nextBio(args.bio, existing?.bio);
        const profile = {
          accountId,
          avatarUrl: args.avatarUrl,
          displayName,
          ...(savedBio === undefined ? {} : { bio: savedBio }),
        };

        if (existing === null) {
          await ctx.db.insert("profiles", profile);
        } else {
          await ctx.db.patch(existing._id, {
            avatarUrl: profile.avatarUrl,
            bio: savedBio,
            displayName: profile.displayName,
          });
        }
        return profile;
      },
    },
    queries: {
      getMyProfile: async (ctx, { identity }) => {
        if (identity === null) return null;
        return findProfile(ctx, requireAccountId(identity));
      },
      getProfile: (ctx, { args }) =>
        findProfile(ctx, args.accountId.trim().toLowerCase()),
    },
  },
  mutation,
  protocol: accountsProtocol,
  query,
});

function requireAccountId(
  identity: null | { accountId?: string; email?: string },
) {
  const accountId = (identity?.accountId ?? identity?.email)
    ?.trim()
    .toLowerCase();
  if (accountId?.includes("@") !== true) {
    throw new ConvexError({ code: "AUTHENTICATED_ACCOUNT_REQUIRED" });
  }
  return accountId;
}

async function findProfile(ctx: QueryCtx, accountId: string) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_account", (index) => index.eq("accountId", accountId))
    .unique();
  return profile === null
    ? null
    : {
        accountId: profile.accountId,
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName,
        ...(profile.bio === undefined ? {} : { bio: profile.bio }),
      };
}

/**
 * The bio to store. An omitted bio keeps the saved one, so name and photo
 * edits (and clients that predate bios) never clear it; empty clears it.
 * Runs of blank lines become one, so a bio can't stretch the profile page.
 */
function nextBio(requested: string | undefined, saved: string | undefined) {
  if (requested === undefined) return saved;
  const bio = requested.trim().replace(/\n\s*\n\s*/g, "\n\n");
  if (!isBioWithinLimit(bio)) {
    throw new ConvexError({ code: "INVALID_BIO" });
  }
  return bio.length === 0 ? undefined : bio;
}

/**
 * Counts user-perceived characters (grapheme clusters), as the iOS text
 * field does, so a bio of emoji that fits on the phone also fits here. The
 * raw cap stops one "character" from carrying unbounded combining marks.
 */
function isBioWithinLimit(bio: string) {
  if (bio.length > PROFILE_BIO_MAX_LENGTH * 16) return false;
  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return [...graphemes.segment(bio)].length <= PROFILE_BIO_MAX_LENGTH;
}
