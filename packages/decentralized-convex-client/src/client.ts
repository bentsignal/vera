import type { DiscoveredPds } from "@decentralized-convex/address";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { discoverPds } from "@decentralized-convex/address";

import type { PdsMutationOptions } from "./optimistic.ts";
import type {
  AnyPdsMutationRequest,
  AnyPdsQueryRequest,
  DefaultCombinedPdsResult,
  FederatedPdsQueryOptions,
  PdsRequestResult,
} from "./pds.ts";
import type { PdsQueryExecutionOptions } from "./query-execution.ts";
import type {
  FederatedQueryOptions,
  FederationClientOptions,
  FederationConnection,
  FederationMutationReference,
  FederationQueryReference,
  FederationTarget,
} from "./types.ts";
import { assertPdsSupportsRequest } from "./compatibility.ts";
import { createConvexFederationConnection } from "./connection.ts";
import { toError } from "./errors.ts";
import { includedOnHome } from "./included.ts";
import { FederatedQueryObserver } from "./observer.ts";
import { FederatedPdsQueryObserver } from "./pds-observer.ts";
import { PdsClient } from "./pds.ts";
import {
  initialResponseTimeout,
  partialResultsDelay,
  wait,
  withInitialResponseTimeout,
} from "./query-execution.ts";
import { RoutedPdsQueryObserver } from "./routed-pds-observer.ts";
import { PdsDirectory, resolvedTargets, unresolvedSources } from "./routes.ts";
import { createFederatedSnapshot } from "./snapshot.ts";
import {
  federationTargetKey,
  groupFederationTargets,
  normalizeFederationUrl,
  pdsTarget,
} from "./targets.ts";
import { sourceDomains, tryTrustedAnswer } from "./trust.ts";

export class DecentralizedConvexClient {
  readonly #connectionFactory;
  readonly #connections = new Map<string, FederationConnection>();
  readonly #getAuthToken;
  readonly #home?: DiscoveredPds;
  readonly #pds;

  constructor(options: FederationClientOptions = {}) {
    this.#connectionFactory =
      options.connectionFactory ?? createConvexFederationConnection;
    this.#pds = new PdsDirectory(options.pds?.discover ?? discoverPds);
    this.#getAuthToken = options.getAuthToken;
    this.#home = options.pds?.home;
    if (this.#home !== undefined) this.#pds.remember(this.#home);
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
    return new FederatedPdsQueryObserver(options, (url, domain) =>
      this.#getConnection(url, domain),
    );
  }

  watchPdsQuery<Request extends AnyPdsQueryRequest>(
    request: Request,
    options: PdsQueryExecutionOptions = {},
  ) {
    const home = this.#requireHome();
    assertPdsSupportsRequest(home, request);
    return new RoutedPdsQueryObserver({
      getConnection: (url, domain) => this.#getConnection(url, domain),
      home: pdsTarget(home.domain, home),
      include: options.include,
      initialResponseTimeout: initialResponseTimeout(options),
      knownPds: this.#pds.byDomain,
      request,
      revealPartialResultsAfter: partialResultsDelay(options),
      resolveRoutes: (routes) => this.#pds.resolveRoutes(routes, request),
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
            connection: this.#getConnection(target.url, target.domain),
          }).query(request);
          return {
            ...tryTrustedAnswer(request, data, sourceDomains(target), {
              home: false,
            }),
            target,
          };
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
    const responseTimeout = initialResponseTimeout(options);
    const revealPartialResultsAfter = partialResultsDelay(options);
    const home = this.#requireHome();
    assertPdsSupportsRequest(home, request);
    const homeTarget = pdsTarget(home.domain, home);
    const homeGroup = groupFederationTargets([homeTarget])[0];
    if (homeGroup === undefined) throw new Error("PDS home is invalid");
    const homeResult = await withInitialResponseTimeout(
      new PdsClient({
        connection: this.#getConnection(homeTarget.url),
      }).queryWithRouting(request),
      responseTimeout,
      homeTarget.url,
    );
    const routes = await this.#pds.resolveRoutes(homeResult.routes, request);
    const targets = groupFederationTargets([
      homeTarget,
      ...resolvedTargets(routes),
    ]);
    const included = includedOnHome(
      homeResult.included,
      homeTarget,
      this.#pds.byDomain,
    );
    const answered = await Promise.all(
      targets.map(async (target) => {
        const home =
          federationTargetKey(target) === federationTargetKey(homeGroup);
        try {
          const data = home
            ? homeResult.data
            : await withInitialResponseTimeout(
                new PdsClient({
                  connection: this.#getConnection(target.url, target.domain),
                }).query(request),
                responseTimeout,
                target.url,
              );
          return {
            ...tryTrustedAnswer(request, data, sourceDomains(target), { home }),
            target,
          };
        } catch (error) {
          return {
            error: toError(error),
            status: "error" as const,
            target,
          };
        }
      }),
    );
    const settled = [...unresolvedSources(routes), ...answered];
    const snapshot = createFederatedSnapshot<
      PdsRequestResult<Request>,
      DefaultCombinedPdsResult<Request>
    >(settled);
    if (snapshot.status === "partial") {
      const remaining = revealPartialResultsAfter - (Date.now() - startedAt);
      if (remaining > 0) await wait(remaining);
    }
    return { ...snapshot, included };
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

  /**
   * Runs a mutation on the home PDS. An `optimisticUpdate` changes the home
   * PDS's query results right away, until the mutation's result arrives.
   */
  pdsMutation<Request extends AnyPdsMutationRequest>(
    request: Request,
    options?: PdsMutationOptions,
  ) {
    const home = this.#requireHome();
    assertPdsSupportsRequest(home, request);
    return new PdsClient({
      connection: this.#getConnection(home.manifest.deploymentUrl),
    }).mutation(request, options);
  }

  /**
   * Opens the connection to the home PDS (and starts authenticating it)
   * ahead of the first query, so that query doesn't wait for either.
   */
  connectHome() {
    this.#getConnection(this.#requireHome().manifest.deploymentUrl);
  }

  /**
   * Signs every open connection in again with the token the fetcher has
   * now (see `FederationConnection.reauthenticate`).
   */
  reauthenticate() {
    for (const connection of this.#connections.values()) {
      connection.reauthenticate?.();
    }
  }

  resolvePds(addressOrDomain: string) {
    return this.#pds.resolve(addressOrDomain);
  }

  async close() {
    await Promise.all(
      [...this.#connections.values()].map((connection) => connection.close()),
    );
    this.#connections.clear();
  }

  /**
   * The connection to a deployment, for the domain whose discovery led to
   * it. Each domain other than home gets its own, signed in for that
   * domain's PDS, so a manifest that names another domain's deployment
   * can't change how that one is signed in to.
   */
  #getConnection(inputUrl: string, domain?: string) {
    const url = normalizeFederationUrl(inputUrl);
    const shared = domain === undefined || domain === this.#home?.domain;
    const key = shared ? url : federationTargetKey({ domain, url });
    const existing = this.#connections.get(key);
    if (existing !== undefined) return existing;
    const fetchAuthToken = this.#getAuthToken;
    const pds = () =>
      domain === undefined
        ? this.#pds.atUrl(url)
        : this.#pds.byDomain.get(domain);
    const getAuthToken =
      fetchAuthToken === undefined
        ? undefined
        : (request: Parameters<typeof fetchAuthToken>[0]) =>
            fetchAuthToken({ ...request, pds: pds() });
    const connection = this.#connectionFactory(url, getAuthToken);
    this.#connections.set(key, connection);
    return connection;
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
