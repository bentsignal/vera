import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { ConvexClient } from "convex/browser";

import type {
  FederationAuthTokenFetcher,
  FederationConnection,
  FederationMutationReference,
  FederationQueryReference,
} from "./types.ts";

class ConvexFederationConnection implements FederationConnection {
  readonly #client;

  constructor(url: string, getAuthToken?: FederationAuthTokenFetcher) {
    this.#client = new ConvexClient(url);
    if (getAuthToken !== undefined) {
      this.#client.setAuth(({ forceRefreshToken }) =>
        getAuthToken({ forceRefreshToken, url }),
      );
    }
  }

  close() {
    return this.#client.close();
  }

  mutation<Mutation extends FederationMutationReference>(
    mutation: Mutation,
    args: FunctionArgs<Mutation>,
  ): Promise<FunctionReturnType<Mutation>> {
    return this.#client.mutation(mutation, args);
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
