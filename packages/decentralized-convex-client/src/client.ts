import type { FunctionArgs, FunctionReturnType } from "convex/server";

import type {
  FederatedQueryOptions,
  FederationClientOptions,
  FederationConnection,
  FederationMutationReference,
  FederationQueryReference,
  FederationTarget,
} from "./types.ts";
import { createConvexFederationConnection } from "./connection.ts";
import { FederatedQueryObserver } from "./observer.ts";
import { createFederatedSnapshot } from "./snapshot.ts";
import { groupFederationTargets, normalizeFederationUrl } from "./targets.ts";

export class DecentralizedConvexClient {
  readonly #connectionFactory;
  readonly #connections = new Map<string, FederationConnection>();
  readonly #getAuthToken;

  constructor(options: FederationClientOptions = {}) {
    this.#connectionFactory =
      options.connectionFactory ?? createConvexFederationConnection;
    this.#getAuthToken = options.getAuthToken;
  }

  watchQuery<Query extends FederationQueryReference, Combined>(
    options: FederatedQueryOptions<Query, Combined>,
  ) {
    return new FederatedQueryObserver(options, (url) =>
      this.#getConnection(url),
    );
  }

  async query<Query extends FederationQueryReference, Combined>(
    options: FederatedQueryOptions<Query, Combined>,
  ) {
    const groups = groupFederationTargets(options.targets);
    const settled = await Promise.all(
      groups.map(async (target) => {
        const args =
          typeof options.args === "function"
            ? options.args(target)
            : options.args;
        try {
          const data = await this.#getConnection(target.url).query(
            options.query,
            args,
          );
          return { data, status: "live" as const, target };
        } catch (error) {
          return {
            error: toError(error),
            status: "error" as const,
            target,
          };
        }
      }),
    );
    return createFederatedSnapshot<FunctionReturnType<Query>, Combined>(
      settled,
      options.combine,
    );
  }

  mutation<Mutation extends FederationMutationReference>(
    target: FederationTarget,
    mutation: Mutation,
    args: FunctionArgs<Mutation>,
  ): Promise<FunctionReturnType<Mutation>> {
    return this.#getConnection(target.url).mutation(mutation, args);
  }

  async close() {
    await Promise.all(
      [...this.#connections.values()].map((connection) => connection.close()),
    );
    this.#connections.clear();
  }

  #getConnection(inputUrl: string) {
    const url = normalizeFederationUrl(inputUrl);
    const existing = this.#connections.get(url);
    if (existing !== undefined) return existing;
    const connection = this.#connectionFactory(url, this.#getAuthToken);
    this.#connections.set(url, connection);
    return connection;
  }
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error("Federation query failed");
}
