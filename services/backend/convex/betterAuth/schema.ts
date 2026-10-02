import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const optionalString = v.optional(v.union(v.null(), v.string()));

// Mirrors the tables Better Auth needs for Vera's plugins: core accounts and
// sessions, JWKS for Convex tokens, and passkeys.
export default defineSchema({
  user: defineTable({
    createdAt: v.number(),
    email: v.string(),
    emailVerified: v.boolean(),
    image: optionalString,
    name: v.string(),
    updatedAt: v.number(),
    userId: optionalString,
  })
    .index("email_name", ["email", "name"])
    .index("name", ["name"])
    .index("userId", ["userId"]),
  session: defineTable({
    createdAt: v.number(),
    expiresAt: v.number(),
    ipAddress: optionalString,
    token: v.string(),
    updatedAt: v.number(),
    userAgent: optionalString,
    userId: v.string(),
  })
    .index("expiresAt", ["expiresAt"])
    .index("expiresAt_userId", ["expiresAt", "userId"])
    .index("token", ["token"])
    .index("userId", ["userId"]),
  account: defineTable({
    accessToken: optionalString,
    accessTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
    accountId: v.string(),
    createdAt: v.number(),
    idToken: optionalString,
    password: optionalString,
    providerId: v.string(),
    refreshToken: optionalString,
    refreshTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
    scope: optionalString,
    updatedAt: v.number(),
    userId: v.string(),
  })
    .index("accountId", ["accountId"])
    .index("accountId_providerId", ["accountId", "providerId"])
    .index("providerId_userId", ["providerId", "userId"])
    .index("userId", ["userId"]),
  verification: defineTable({
    createdAt: v.number(),
    expiresAt: v.number(),
    identifier: v.string(),
    updatedAt: v.number(),
    value: v.string(),
  })
    .index("expiresAt", ["expiresAt"])
    .index("identifier", ["identifier"]),
  jwks: defineTable({
    createdAt: v.number(),
    expiresAt: v.optional(v.union(v.null(), v.number())),
    privateKey: v.string(),
    publicKey: v.string(),
  }),
  passkey: defineTable({
    aaguid: optionalString,
    backedUp: v.boolean(),
    counter: v.number(),
    createdAt: v.optional(v.union(v.null(), v.number())),
    credentialID: v.string(),
    deviceType: v.string(),
    name: optionalString,
    publicKey: v.string(),
    transports: optionalString,
    userId: v.string(),
  })
    .index("credentialID", ["credentialID"])
    .index("userId", ["userId"]),
});
