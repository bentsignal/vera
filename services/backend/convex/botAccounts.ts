import { requireEnvironment } from "./lib";

// Vera's own accounts and their addresses, apart from what they do
// (bots.ts), so the PDS router can tell a message to one without loading
// any of that: Convex loads every module a function imports on every call
// (docs/architecture.md, "Function bundles").

export interface BotAccount extends AnyBotAccount {
  readonly username: "vera";
}

/** Any of Vera's accounts, including the retired support account (mergeSupport.ts). */
export interface AnyBotAccount {
  readonly name: string;
  readonly username: string;
}

export const VERA = { name: "Vera", username: "vera" } as const;

/** The accounts that answer direct messages with a model. */
export const ASSISTANTS: readonly BotAccount[] = [VERA];

export function botAccount(username: BotAccount["username"]) {
  return { vera: VERA }[username];
}

/** Whether an address is one of Vera's own accounts. */
export function isBotAddress(accountId: string) {
  return ASSISTANTS.some((bot) => botAddress(bot) === accountId);
}

export function botAddress(bot: AnyBotAccount) {
  return `${bot.username}@${requireEnvironment("FEDERATION_DOMAIN").toLowerCase()}`;
}

/** A field of an unknown value, or undefined. */
export function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, name)
    : undefined;
}
