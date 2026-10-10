import type { AnyPdsMutationRequest } from "@decentralized-convex/client";
import type { ReactNode } from "react";
import { createContext, use } from "react";

import type { AccountSession } from "~/features/session/account-session";
import { useSession } from "~/features/session/session-provider";

interface Scope {
  readonly address: string | undefined;
  readonly signedOut: AccountSession | undefined;
}

const ScopeContext = createContext<Scope | undefined>(undefined);

/**
 * Makes everything below act as one signed-in account, such as a
 * conversation opened from that account's inbox. Unknown or missing
 * addresses fall back to the first account.
 *
 * `signedOut` is the session to keep acting as once `address` signs out,
 * so a screen that signs out of its account still shows that account
 * while it closes, instead of another one.
 */
export function AccountScope({
  address,
  signedOut,
  children,
}: {
  address: string | undefined;
  signedOut?: AccountSession;
  children: ReactNode;
}) {
  return <ScopeContext value={{ address, signedOut }}>{children}</ScopeContext>;
}

/** Every signed-in account. */
export function useAccounts() {
  return useSession().accounts;
}

/**
 * Runs PDS mutations as whichever signed-in account owns the thing being
 * changed, such as a row in the combined inbox. Failures are ignored.
 */
export function useRunAs() {
  const accounts = useAccounts();
  return (address: string, request: AnyPdsMutationRequest) =>
    accounts
      .find((account) => account.address === address)
      ?.pds.mutate(request)
      .catch(() => null);
}

/** The accounts the Inbox and Spaces show: the filtered one, or all. */
export function useVisibleAccounts() {
  const { accounts, filter } = useSession();
  const only = accounts.filter((account) => account.address === filter);
  return only.length > 0 ? only : accounts;
}

function describe(session: AccountSession | undefined) {
  if (session === undefined) {
    throw new Error("useAccount needs a signed-in account");
  }
  return {
    address: session.address,
    session,
    username: session.username,
  };
}

/**
 * The account this screen acts as: the nearest `AccountScope`, otherwise
 * the first signed-in account.
 */
export function useAccount() {
  const scope = use(ScopeContext);
  const { accounts } = useSession();
  return describe(
    accounts.find((account) => account.address === scope?.address) ??
      scope?.signedOut ??
      accounts[0],
  );
}
