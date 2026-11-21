import { env } from "../../env.ts";

function domainOf(address: string) {
  return address.slice(address.lastIndexOf("@") + 1);
}

/**
 * The servers whose word the app takes for the verified check: Vera's own
 * (`vera.chat`, or in a development build the dev server it talks to).
 * Any server can call its accounts affiliated, so another server's say-so
 * never shows the check.
 */
const VERIFYING_DOMAINS = new Set(["vera.chat", env.veraDomain]);

/** Whether `address` shows the verified check, given its profile's say-so. */
export function verified(address: string, affiliated: boolean | undefined) {
  return affiliated === true && VERIFYING_DOMAINS.has(domainOf(address));
}
