import { formatAddress, parseAddress } from "@decentralized-convex/address";
import { v } from "convex/values";

import type { SignUpAttempt, SignUpDeviceStore } from "../sign-up-devices";
import type { ActionCtx } from "./_generated/server";
import {
  checkSignUpDevice,
  deviceCheckConfig,
  finishSignUpDevice,
  hasRoom,
} from "../sign-up-devices";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireEnvironment } from "./lib";

// One account per phone at sign-up: the checks are in sign-up-devices.ts,
// and this keeps their state. convex/auth.ts calls `signUpDeviceStep`.

/** How long a checked Android sign-up has to make its passkey. */
const CLAIM_MS = 15 * 60 * 1000;
/** How long the iPhone sign-up slot is held at most (sign-up-devices.ts). */
const LOCK_MS = 30 * 1000;
/** How long an operator's allowance lasts. */
const ALLOWANCE_MS = 24 * 60 * 60 * 1000;

function store(ctx: ActionCtx): SignUpDeviceStore {
  return {
    allowed: (address) =>
      ctx.runQuery(internal.signUpDevices.allowed, { address }),
    claim: (address, deviceKey, limit) =>
      ctx.runMutation(internal.signUpDevices.claim, {
        address,
        deviceKey,
        limit,
      }),
    finish: (address) =>
      ctx.runMutation(internal.signUpDevices.finish, { address }),
    lock: () => ctx.runMutation(internal.signUpDevices.lock, {}),
    unlock: async () => {
      await ctx.runMutation(internal.signUpDevices.unlock, {});
    },
    useAllowance: (address) =>
      ctx.runMutation(internal.signUpDevices.useAllowance, { address }),
  };
}

/** The sign-up's start (`check`) or finish, with this deployment's settings. */
export function signUpDeviceStep(
  ctx: ActionCtx,
  step: "check" | "finish",
  signUp: SignUpAttempt,
) {
  const config = deviceCheckConfig(process.env);
  return step === "check"
    ? checkSignUpDevice(store(ctx), config, signUp)
    : finishSignUpDevice(store(ctx), config, signUp);
}

const LOCK = "apple";

/** Takes the iPhone sign-up slot, unless another sign-up holds it. */
export const lock = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const held = await ctx.db
      .query("signUpLocks")
      .withIndex("by_name", (q) => q.eq("name", LOCK))
      .unique();
    if (held !== null && held.expiresAt > now) return false;
    if (held === null) {
      await ctx.db.insert("signUpLocks", {
        expiresAt: now + LOCK_MS,
        name: LOCK,
      });
    } else {
      await ctx.db.patch(held._id, { expiresAt: now + LOCK_MS });
    }
    return true;
  },
});

export const unlock = internalMutation({
  args: {},
  handler: async (ctx) => {
    const held = await ctx.db
      .query("signUpLocks")
      .withIndex("by_name", (q) => q.eq("name", LOCK))
      .unique();
    if (held !== null) await ctx.db.patch(held._id, { expiresAt: 0 });
  },
});

export const allowed = internalQuery({
  args: { address: v.string() },
  handler: async (ctx, { address }) => {
    const allowance = await ctx.db
      .query("signUpAllowances")
      .withIndex("by_address", (q) => q.eq("address", address))
      .first();
    return allowance !== null && allowance.expiresAt > Date.now();
  },
});

/** Uses up an operator's allowance for this address, if it has one. */
export const useAllowance = internalMutation({
  args: { address: v.string() },
  handler: async (ctx, { address }) => {
    const allowances = await ctx.db
      .query("signUpAllowances")
      .withIndex("by_address", (q) => q.eq("address", address))
      .collect();
    await Promise.all(allowances.map((row) => ctx.db.delete(row._id)));
    return allowances.some((row) => row.expiresAt > Date.now());
  },
});

/**
 * Holds one of this Android phone's sign-ups for `address` while its
 * passkey is made: false when the phone's accounts, plus the sign-ups it
 * has under way, already reach the limit.
 */
export const claim = internalMutation({
  args: { address: v.string(), deviceKey: v.string(), limit: v.number() },
  handler: async (ctx, { address, deviceKey, limit }) => {
    const now = Date.now();
    const device = await ctx.db
      .query("signUpDevices")
      .withIndex("by_device", (q) => q.eq("deviceKey", deviceKey))
      .unique();
    const claims = await ctx.db
      .query("signUpClaims")
      .withIndex("by_device", (q) => q.eq("deviceKey", deviceKey))
      .collect();
    if (
      !hasRoom({ accounts: device?.accounts ?? 0, address, claims, limit, now })
    ) {
      return false;
    }
    // This address's earlier attempt, and expired ones, make way.
    for (const row of claims) {
      if (row.expiresAt <= now) await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query("signUpClaims")
      .withIndex("by_address", (q) => q.eq("address", address))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("signUpClaims", {
      address,
      deviceKey,
      expiresAt: now + CLAIM_MS,
    });
    return true;
  },
});

/** Turns the address's claim into one of its phone's accounts. */
export const finish = internalMutation({
  args: { address: v.string() },
  handler: async (ctx, { address }) => {
    const claims = await ctx.db
      .query("signUpClaims")
      .withIndex("by_address", (q) => q.eq("address", address))
      .collect();
    await Promise.all(claims.map((row) => ctx.db.delete(row._id)));
    const live = claims.find((row) => row.expiresAt > Date.now());
    if (live === undefined) return false;
    const device = await ctx.db
      .query("signUpDevices")
      .withIndex("by_device", (q) => q.eq("deviceKey", live.deviceKey))
      .unique();
    if (device === null) {
      await ctx.db.insert("signUpDevices", {
        accounts: 1,
        deviceKey: live.deviceKey,
      });
    } else {
      await ctx.db.patch(device._id, { accounts: device.accounts + 1 });
    }
    return true;
  },
});

/**
 * Operator command, for Shawn's test accounts on phones that already have
 * theirs: `npx convex run signUpDevices:allow '{"username":"shawn2"}'` lets
 * that username sign up on any phone within a day, without counting it.
 */
export const allow = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const address = formatAddress(
      parseAddress(
        `${username.trim()}@${requireEnvironment("FEDERATION_DOMAIN")}`,
      ),
    );
    const expiresAt = Date.now() + ALLOWANCE_MS;
    await ctx.db.insert("signUpAllowances", { address, expiresAt });
    return { address, expiresAt: new Date(expiresAt).toISOString() };
  },
});
