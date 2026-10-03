import type { Infer } from "convex/values";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { v } from "convex/values";

import { decentralizedConvexPackage } from "./metadata.ts";

/** The longest bio, in user-perceived characters (grapheme clusters). */
export const PROFILE_BIO_MAX_LENGTH = 150;

export const accountProfile = v.object({
  accountId: v.string(),
  avatarUrl: v.union(v.null(), v.string()),
  /** A short line about the person; absent when they haven't written one. */
  bio: v.optional(v.string()),
  displayName: v.string(),
});

export type AccountProfile = Infer<typeof accountProfile>;

export const accountsProtocol = definePluginProtocol({
  lastChanged: decentralizedConvexPackage.lastChanged,
  name: "accounts",
  mutations: {
    upsertMyProfile: defineOperation({
      args: v.object({
        avatarUrl: v.union(v.null(), v.string()),
        /** Omit to keep the saved bio; an empty string clears it. */
        bio: v.optional(v.string()),
        displayName: v.string(),
      }),
      returns: accountProfile,
    }),
  },
  queries: {
    getMyProfile: defineOperation({
      args: v.object({}),
      returns: v.union(v.null(), accountProfile),
    }),
    getProfile: defineOperation({
      args: v.object({ accountId: v.string() }),
      returns: v.union(v.null(), accountProfile),
    }),
  },
  requires: {},
});
