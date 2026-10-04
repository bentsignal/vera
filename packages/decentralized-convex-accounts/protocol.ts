import type { Infer } from "convex/values";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { v } from "convex/values";

import { decentralizedConvexPackage } from "./metadata.ts";

export const accountProfile = v.object({
  accountId: v.string(),
  /**
   * Whether the account's PDS vouches that it speaks for the PDS itself,
   * such as its support account. A PDS sets this only for its own
   * accounts. Missing from older PDSs.
   */
  affiliated: v.optional(v.boolean()),
  avatarUrl: v.union(v.null(), v.string()),
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
