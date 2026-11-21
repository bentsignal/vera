import type { AnyPluginProtocol } from "@decentralized-convex/plugin";
import { accountDomain } from "@decentralized-convex/address";

import type { SerializedPdsRequest } from "./api.ts";
import type { FederationTargetGroup } from "./types.ts";
import { toError } from "./errors.ts";

// A PDS is believed only about its own accounts: those on the domains whose
// discovery led to it. Every answer a PDS gives a query gathered from
// several PDSs passes through the query's `trust` (see `Operation.trust`
// in `@decentralized-convex/plugin`) before anything combines it, so a PDS
// can't show messages, reactions, or profiles as another server's
// accounts', or replace another server's rows with its own.

type TrustRule = (
  value: unknown,
  source: {
    readonly args: Record<string, unknown>;
    readonly owns: (accountId: string) => boolean;
  },
) => unknown;

const rules = new Map<string, TrustRule>();

function ruleKey(plugin: string, type: string) {
  return `${plugin}\u0000${type}`;
}

/** Records the `trust` of each of a protocol's queries (see `definePdsApi`). */
export function registerTrust(protocol: AnyPluginProtocol) {
  for (const [type, operation] of Object.entries(protocol.queries)) {
    if (operation.trust === undefined) continue;
    rules.set(ruleKey(protocol.name, type), (value, source) =>
      operation.trust?.(value, source),
    );
  }
}

/** A PDS answered a query it may not be believed about. */
export class UntrustedPdsAnswerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UntrustedPdsAnswerError";
  }
}

/** Whether `accountId` is an address on one of `domains`. */
function ownedBy(domains: ReadonlySet<string>) {
  return (accountId: string) => {
    if (typeof accountId !== "string") return false;
    const separator = accountId.lastIndexOf("@");
    if (separator <= 0) return false;
    try {
      return domains.has(accountDomain(accountId));
    } catch {
      return false;
    }
  };
}

/**
 * The domains a source speaks for: the one its PDS was discovered for, or,
 * for a target named directly (`federatedPdsQuery`), its targets' domains.
 */
export function sourceDomains(target: FederationTargetGroup) {
  if (target.domain !== undefined) return new Set([target.domain]);
  return new Set(
    target.ids.flatMap((id) => {
      try {
        return [accountDomain(id)];
      } catch {
        return [];
      }
    }),
  );
}

/**
 * What a PDS's answer is believed about: the answer with everything about
 * accounts that aren't on `domains` left out. A query without a `trust`
 * is believed only from the home PDS (`home`), which is the account's own;
 * from any other it throws, as does an answer the rule can't read.
 */
export function trustedAnswer<Result>(
  request: SerializedPdsRequest,
  value: Result,
  domains: ReadonlySet<string>,
  { home }: { readonly home: boolean },
): Result {
  const rule = rules.get(ruleKey(request.plugin, request.operation.type));
  if (rule === undefined) {
    if (home) return value;
    throw new UntrustedPdsAnswerError(
      `${request.plugin}.${request.operation.type} doesn't say what another PDS is believed about`,
    );
  }
  try {
    // The rule comes from the protocol that built this request, so it returns the same type.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return rule(value, {
      args: request.operation.args,
      owns: ownedBy(domains),
    }) as Result;
  } catch (error) {
    throw new UntrustedPdsAnswerError("A PDS's answer couldn't be read", {
      cause: toError(error),
    });
  }
}

/** Like `trustedAnswer`, or the error that stops it being believed. */
export function tryTrustedAnswer<Result>(
  request: SerializedPdsRequest,
  value: Result,
  domains: ReadonlySet<string>,
  options: { readonly home: boolean },
):
  | { readonly data: Result; readonly status: "live" }
  | { readonly error: Error; readonly status: "error" } {
  try {
    return {
      data: trustedAnswer(request, value, domains, options),
      status: "live",
    };
  } catch (error) {
    return { error: toError(error), status: "error" };
  }
}
