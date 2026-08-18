import type { DiscoveredPds } from "@decentralized-convex/address";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { accountDomain, discoverPds } from "@decentralized-convex/address";

import type {
  AnyPdsMutationRequest,
  AnyPdsQueryRequest,
  DefaultCombinedPdsResult,
  FederatedPdsQueryOptions,
  PdsRequestResult,
} from "./pds.ts";
import type {
  FederatedQueryOptions,
  FederationClientOptions,
  FederationConnection,
  FederationMutationReference,
  FederationQueryReference,
  FederationTarget,
} from "./types.ts";
import { assertPdsRequestCompatibility } from "./compatibility.ts";
import { createConvexFederationConnection } from "./connection.ts";
import { FederatedQueryObserver } from "./observer.ts";
import { FederatedPdsQueryObserver } from "./pds-observer.ts";
import { PdsClient } from "./pds.ts";
import { RoutedPdsQueryObserver } from "./routed-pds-observer.ts";
import { createFederatedSnapshot } from "./snapshot.ts";
import { groupFederationTargets, normalizeFederationUrl } from "./targets.ts";

export const DEFAULT_REVEAL_PARTIAL_RESULTS_AFTER = 500;

export interface PdsQueryExecutionOptions {
  readonly revealPartialResultsAfter?: number;
}

export class DecentralizedConvexClient {
  readonly #connectionFactory;
  readonly #connections = new Map<string, FederationConnection>();
  readonly #discoverPds;
  readonly #getAuthToken;
  readonly #home?: DiscoveredPds;
  readonly #pdsByDomain = new Map<string, DiscoveredPds>();
  readonly #pdsByUrl = new Map<string, DiscoveredPds>();
  readonly #pdsResolutions = new Map<string, Promise<DiscoveredPds>>();

  constructor(options: FederationClientOptions = {}) {
    this.#connectionFactory =
      options.connectionFactory ?? createConvexFederationConnection;
    this.#discoverPds = options.pds?.discover ?? discoverPds;
    this.#getAuthToken = options.getAuthToken;
    this.#home = options.pds?.home;
    if (this.#home !== undefined) this.#rememberPds(this.#home);
  }

  watchQuery<Query extends FederationQueryReference, Combined>(
    options: FederatedQueryOptions<Query, Combined>,
  ) {
    return new FederatedQueryObserver(options, (url) =>
      this.#getConnection(url),
    );
  }

  watchFederatedPdsQuery<
    Request extends AnyPdsQueryRequest,
    Combined = DefaultCombinedPdsResult<Request>,
  >(options: FederatedPdsQueryOptions<Request, Combined>) {
    return new FederatedPdsQueryObserver(options, (url) =>
      this.#getConnection(url),
    );
  }

  watchPdsQuery<Request extends AnyPdsQueryRequest>(
    request: Request,
    options: PdsQueryExecutionOptions = {},
  ) {
    const home = this.#requireHome();
    assertPdsRequestCompatibility(home, request);
    return new RoutedPdsQueryObserver({
      getConnection: (url) => this.#getConnection(url),
      home: pdsTarget(home.domain, home),
      request,
      revealPartialResultsAfter: partialResultsDelay(options),
      resolveRoutes: (routes) => this.#resolveRoutes(routes, request),
    });
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

  async federatedPdsQuery<
    Request extends AnyPdsQueryRequest,
    Combined = DefaultCombinedPdsResult<Request>,
  >(options: FederatedPdsQueryOptions<Request, Combined>) {
    const groups = groupFederationTargets(options.targets);
    const settled = await Promise.all(
      groups.map(async (target) => {
        const request =
          typeof options.request === "function"
            ? options.request(target)
            : options.request;
        try {
          const data = await new PdsClient({
            connection: this.#getConnection(target.url),
          }).query(request);
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
    return createFederatedSnapshot<PdsRequestResult<Request>, Combined>(
      settled,
      options.combine,
    );
  }

  async pdsQuery<Request extends AnyPdsQueryRequest>(
    request: Request,
    options: PdsQueryExecutionOptions = {},
  ) {
    const startedAt = Date.now();
    const revealPartialResultsAfter = partialResultsDelay(options);
    const home = this.#requireHome();
    assertPdsRequestCompatibility(home, request);
    const homeTarget = pdsTarget(home.domain, home);
    const homeGroup = groupFederationTargets([homeTarget])[0];
    if (homeGroup === undefined) throw new Error("PDS home is invalid");
    const homeResult = await new PdsClient({
      connection: this.#getConnection(homeTarget.url),
    }).queryWithRouting(request);
    const targets = groupFederationTargets([
      homeTarget,
      ...(await this.#resolveRoutes(homeResult.routes, request)),
    ]);
    const settled = await Promise.all(
      targets.map(async (target) => {
        if (target.url === homeGroup.url) {
          return { data: homeResult.data, status: "live" as const, target };
        }
        try {
          const data = await new PdsClient({
            connection: this.#getConnection(target.url),
          }).query(request);
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
    const snapshot = createFederatedSnapshot<
      PdsRequestResult<Request>,
      DefaultCombinedPdsResult<Request>
    >(settled);
    if (snapshot.status === "partial") {
      const remaining = revealPartialResultsAfter - (Date.now() - startedAt);
      if (remaining > 0) await wait(remaining);
    }
    return snapshot;
  }

  mutation<Mutation extends FederationMutationReference>(
    target: FederationTarget,
    mutation: Mutation,
    args: FunctionArgs<Mutation>,
  ): Promise<FunctionReturnType<Mutation>> {
    return this.#getConnection(target.url).mutation(mutation, args);
  }

  federatedPdsMutation<Request extends AnyPdsMutationRequest>(
    target: FederationTarget,
    request: Request,
  ): Promise<PdsRequestResult<Request>> {
    return new PdsClient({
      connection: this.#getConnection(target.url),
    }).mutation(request);
  }

  pdsMutation<Request extends AnyPdsMutationRequest>(request: Request) {
    const home = this.#requireHome();
    assertPdsRequestCompatibility(home, request);
    return new PdsClient({
      connection: this.#getConnection(home.manifest.deploymentUrl),
    }).mutation(request);
  }

  async resolvePds(addressOrDomain: string) {
    const domain = accountDomain(addressOrDomain);
    const existing = this.#pdsByDomain.get(domain);
    if (existing !== undefined) return existing;
    const pending = this.#pdsResolutions.get(domain);
    if (pending !== undefined) return pending;
    const resolution = this.#discoverPds(addressOrDomain)
      .then((resolved) => {
        this.#rememberPds(resolved);
        return resolved;
      })
      .finally(() => {
        this.#pdsResolutions.delete(domain);
      });
    this.#pdsResolutions.set(domain, resolution);
    return resolution;
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
    const fetchAuthToken = this.#getAuthToken;
    const getAuthToken =
      fetchAuthToken === undefined
        ? undefined
        : (request: Parameters<typeof fetchAuthToken>[0]) =>
            fetchAuthToken({
              ...request,
              pds: this.#pdsByUrl.get(url),
            });
    const connection = this.#connectionFactory(url, getAuthToken);
    this.#connections.set(url, connection);
    return connection;
  }

  async #resolveRoutes(routes: readonly string[], request: AnyPdsQueryRequest) {
    return Promise.all(
      [...new Set(routes)].map(async (route) => {
        const pds = await this.resolvePds(route);
        assertPdsRequestCompatibility(pds, request);
        return pdsTarget(route, pds);
      }),
    );
  }

  #rememberPds(pds: DiscoveredPds) {
    this.#pdsByDomain.set(pds.domain, pds);
    this.#pdsByUrl.set(normalizeFederationUrl(pds.manifest.deploymentUrl), pds);
  }

  #requireHome() {
    if (this.#home === undefined) {
      throw new Error(
        "Configure FederationClientOptions.pds.home before using automatic PDS routing",
      );
    }
    return this.#home;
  }
}

function pdsTarget(id: string, pds: DiscoveredPds): FederationTarget {
  return { id, url: pds.manifest.deploymentUrl };
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error("Federation query failed");
}

function partialResultsDelay(options: PdsQueryExecutionOptions) {
  const delay =
    options.revealPartialResultsAfter ?? DEFAULT_REVEAL_PARTIAL_RESULTS_AFTER;
  if (!Number.isFinite(delay) || delay < 0) {
    throw new RangeError(
      "revealPartialResultsAfter must be a finite, non-negative number",
    );
  }
  return delay;
}

function wait(delay: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delay));
}
