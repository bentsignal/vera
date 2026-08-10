import type { Infer } from "convex/values";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { v } from "convex/values";

export const accountProfile = v.object({
  accountId: v.string(),
  avatarUrl: v.union(v.null(), v.string()),
  displayName: v.string(),
});

export type AccountProfile = Infer<typeof accountProfile>;

export const accountsProtocol = definePluginProtocol({
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
  version: "1",
});
