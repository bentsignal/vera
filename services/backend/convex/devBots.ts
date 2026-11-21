import type { FunctionArgs } from "convex/server";
import { DECENTRALIZED_CONVEX_VERSION } from "@decentralized-convex/core";
import { ConvexError } from "convex/values";

import type { ActionCtx } from "./_generated/server";
import { components } from "./_generated/api";
import { devToolsEnabled, devToolsSecretMatches } from "./devSignIn";
import { requireEnvironment } from "./lib";

// Development only: bot accounts that act through the PDS plugins as
// themselves. See dev.ts.

export const BOTS = [
  { name: "Maya Chen", username: "maya" },
  { name: "Jonah Weiss", username: "jonah" },
  { name: "Priya Natarajan", username: "priya" },
  { name: "Leo Martins", username: "leo" },
] as const;

export const REPLIES = [
  "haha yes",
  "wait really?",
  "I'm in",
  "omw",
  "can't tonight, tomorrow?",
  "that's so good",
  "lol",
  "send pics",
  "ok but who's driving",
  "agreed 100%",
  "hmm let me think about it",
  "did you see this? https://github.com/expo/expo",
  "👀",
  "Totally forgot about that, thanks for the reminder. I'll look at it after work and get back to you tonight.",
];

type Operation = FunctionArgs<
  typeof components.messages.dispatcher.dispatchMutation
>["operation"];
type QueryOperation = FunctionArgs<
  typeof components.messages.dispatcher.dispatchQuery
>["operation"];

export function pick<Value>(values: readonly Value[], seed: number) {
  const value = values[Math.abs(seed) % values.length];
  if (value === undefined) throw new Error("Nothing to pick from");
  return value;
}

export function requireDevTools() {
  if (!devToolsEnabled()) {
    throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
  }
}

export function botAddress(username: string) {
  return `${username}@${requireEnvironment("FEDERATION_DOMAIN")}`;
}

export function identityFor(accountId: string, name: string) {
  return {
    accountId,
    issuer: "vera-dev",
    name,
    subject: accountId,
    tokenIdentifier: `vera-dev|${accountId}`,
  };
}

export const request = {
  lastChanged: DECENTRALIZED_CONVEX_VERSION,
  version: DECENTRALIZED_CONVEX_VERSION,
} as const;

export async function asAccount(
  ctx: ActionCtx,
  identity: ReturnType<typeof identityFor>,
  operation: Operation,
) {
  const response = await ctx.runMutation(
    components.messages.dispatcher.dispatchMutation,
    { ...request, identity, operation },
  );
  const value: unknown = response.value;
  return value;
}

export async function queryAs(
  ctx: ActionCtx,
  identity: ReturnType<typeof identityFor>,
  operation: QueryOperation,
) {
  const response = await ctx.runQuery(
    components.messages.dispatcher.dispatchQuery,
    { ...request, identity, operation },
  );
  const value: unknown = response.value;
  return value;
}

export function stringField(
  value: unknown,
  field: "conversationId" | "spaceId",
) {
  const result: unknown =
    typeof value === "object" && value !== null
      ? Reflect.get(value, field)
      : undefined;
  if (typeof result !== "string") throw new Error(`Missing ${field}`);
  return result;
}

/** The newest message in a `messages.list` page sent by `author`. */
export function latestMessageBy(page: unknown, author: string) {
  const messages: unknown =
    typeof page === "object" && page !== null
      ? Reflect.get(page, "messages")
      : undefined;
  if (!Array.isArray(messages)) return null;
  const ids = messages.flatMap((message: unknown) =>
    typeof message === "object" &&
    message !== null &&
    Reflect.get(message, "authorId") === author &&
    typeof Reflect.get(message, "messageId") === "string"
      ? [String(Reflect.get(message, "messageId"))]
      : [],
  );
  return ids.at(-1) ?? null;
}

export function listField(value: unknown, field: "channels" | "members") {
  const result: unknown =
    typeof value === "object" && value !== null
      ? Reflect.get(value, field)
      : undefined;
  return Array.isArray(result)
    ? Array.from(result, (item: unknown) => item)
    : [];
}

export function channelsOf(space: unknown) {
  return listField(space, "channels").flatMap((channel: unknown) => {
    const name: unknown =
      typeof channel === "object" && channel !== null
        ? Reflect.get(channel, "name")
        : undefined;
    return typeof name === "string"
      ? [{ conversationId: stringField(channel, "conversationId"), name }]
      : [];
  });
}

/**
 * The signed-in account calling a public dev action, which must also carry
 * the dev tools secret (../dev-tools.ts): a dev PDS takes sign-ups from
 * anyone.
 */
export async function requireCaller(ctx: ActionCtx, secret: string) {
  requireDevTools();
  if (!devToolsSecretMatches(secret)) {
    throw new ConvexError({ code: "DEV_TOOLS_SECRET_REQUIRED" });
  }
  const identity = await ctx.auth.getUserIdentity();
  const accountId =
    typeof identity?.accountId === "string" ? identity.accountId : null;
  if (identity === null || accountId === null) {
    throw new ConvexError({ code: "AUTHENTICATED_ACCOUNT_REQUIRED" });
  }
  return named(ctx, identityFor(accountId, identity.name ?? accountId));
}

/** The account under its display name, as the app writes it in an @mention. */
export async function named(ctx: ActionCtx, caller: Identity) {
  const { accountId } = caller;
  const profile = await ctx.runQuery(
    components.accounts.dispatcher.dispatchQuery,
    {
      ...request,
      identity: caller,
      operation: { args: {}, type: "getMyProfile" },
    },
  );
  const displayName: unknown =
    typeof profile.value === "object" && profile.value !== null
      ? Reflect.get(profile.value, "displayName")
      : undefined;
  return typeof displayName === "string" && displayName.trim() !== ""
    ? identityFor(accountId, displayName.trim())
    : caller;
}

export function botIdentity(bot: (typeof BOTS)[number]) {
  return identityFor(botAddress(bot.username), bot.name);
}

export type Identity = ReturnType<typeof identityFor>;
