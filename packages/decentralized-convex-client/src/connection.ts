import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { ConvexClient } from "convex/browser";

import type { PdsConnectionMutationOptions } from "./optimistic.ts";
import type { PdsConnection } from "./pds.ts";
import type {
  FederationAuthTokenFetcher,
  FederationConnection,
  FederationMutationReference,
  FederationQueryReference,
} from "./types.ts";

/**
 * How long a connection waits before asking for a token again after its
 * fetcher couldn't give one, by attempt: a phone waking often has no
 * network for a moment. After the last, it waits for `reauthenticate`.
 */
const REAUTHENTICATE_AFTER_MS = [1_000, 3_000, 10_000, 30_000, 60_000];

class ConvexFederationConnection implements FederationConnection {
  readonly #client;
  readonly #fetchToken;
  #failures = 0;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #closed = false;

  constructor(url: string, getAuthToken?: FederationAuthTokenFetcher) {
    // A token the fetcher had saved (asked for without `forceRefreshToken`)
    // is used until shortly before it expires, rather than swapped for a
    // fresh one at once, which would make the PDS run every query again.
    this.#client = new ConvexClient(url, { initialAuthTokenReuse: true });
    this.#fetchToken =
      getAuthToken === undefined
        ? undefined
        : ({ forceRefreshToken }: { forceRefreshToken: boolean }) =>
            getAuthToken({ forceRefreshToken, url });
    this.#signIn();
  }

  /**
   * Convex's client takes a fetcher that gave no token to mean signed out,
   * and stops asking. A token request that failed (no network yet, say)
   * would leave the connection signed out until the app restarted, so it
   * asks again, a few times, a while later.
   */
  #signIn() {
    const fetchToken = this.#fetchToken;
    if (fetchToken === undefined || this.#closed) return;
    this.#client.setAuth(fetchToken, (isAuthenticated) => {
      if (isAuthenticated) {
        this.#failures = 0;
        return;
      }
      const delay = REAUTHENTICATE_AFTER_MS[this.#failures];
      if (delay === undefined || this.#closed) return;
      this.#failures += 1;
      clearTimeout(this.#retry);
      this.#retry = setTimeout(() => this.#signIn(), delay);
    });
  }

  reauthenticate() {
    clearTimeout(this.#retry);
    this.#failures = 0;
    this.#signIn();
  }

  close() {
    this.#closed = true;
    clearTimeout(this.#retry);
    return this.#client.close();
  }

  mutation<Mutation extends FederationMutationReference>(
    mutation: Mutation,
    args: FunctionArgs<Mutation>,
    options?: PdsConnectionMutationOptions,
  ): Promise<FunctionReturnType<Mutation>> {
    return this.#client.mutation(mutation, args, options);
  }

  query<Query extends FederationQueryReference>(
    query: Query,
    args: FunctionArgs<Query>,
  ): Promise<FunctionReturnType<Query>> {
    return this.#client.query(query, args);
  }

  subscribe<Query extends FederationQueryReference>(
    query: Query,
    args: FunctionArgs<Query>,
    onResult: (result: FunctionReturnType<Query>) => void,
    onError: (error: Error) => void,
  ) {
    return this.#client.onUpdate(query, args, onResult, onError);
  }
}

export function createConvexFederationConnection(
  url: string,
  getAuthToken?: FederationAuthTokenFetcher,
): FederationConnection {
  return new ConvexFederationConnection(url, getAuthToken);
}

export function createConvexPdsConnection(
  url: string,
  getAuthToken?: FederationAuthTokenFetcher,
): PdsConnection {
  return new ConvexFederationConnection(url, getAuthToken);
}
