import type { DiscoveredPds } from "@decentralized-convex/address";

import type {
  AnyPdsQueryRequest,
  DefaultCombinedPdsResult,
  PdsConnection,
  PdsRequestResult,
} from "./pds.ts";
import type { ResolvedRoute } from "./routes.ts";
import type {
  FederatedQuerySnapshot,
  FederationSourceSnapshot,
  FederationTarget,
  FederationTargetGroup,
  IncludedPdsQuery,
} from "./types.ts";
import { PdsInitialResponseTimeoutError } from "./errors.ts";
import { includedOnHome } from "./included.ts";
import { PdsClient } from "./pds.ts";
import { resolvedTargets, unresolvedSources } from "./routes.ts";
import { createFederatedSnapshot } from "./snapshot.ts";
import { federationTargetKey, groupFederationTargets } from "./targets.ts";
import { sourceDomains, tryTrustedAnswer } from "./trust.ts";

export class RoutedPdsQueryObserver<
  Request extends AnyPdsQueryRequest,
  Combined = DefaultCombinedPdsResult<Request>,
> {
  readonly #getConnection;
  readonly #home;
  readonly #include;
  readonly #initialResponseTimeout;
  readonly #initialResponseTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  #included: readonly IncludedPdsQuery[] = [];
  readonly #listeners = new Set<() => void>();
  readonly #request;
  readonly #homeKey: string;
  readonly #homeTarget;
  readonly #knownPds;
  readonly #revealPartialResultsAfter;
  readonly #resolveRoutes;
  readonly #sources = new Map<
    string,
    FederationSourceSnapshot<PdsRequestResult<Request>>
  >();
  readonly #unsubscribes = new Map<string, () => void>();
  #closed = false;
  #completedInitialLoad = false;
  #partialResultsTimer?: ReturnType<typeof setTimeout>;
  #routesResolved = false;
  #routingGeneration = 0;
  #snapshot: FederatedQuerySnapshot<Combined, PdsRequestResult<Request>>;
  readonly #startedAt = Date.now();

  constructor(options: {
    /** The connection to a deployment, for the domain that led to it. */
    getConnection: (url: string, domain?: string) => PdsConnection;
    home: FederationTarget;
    /** False: watch without what the result includes (see `PdsClient`). */
    include?: boolean;
    initialResponseTimeout: number;
    request: Request;
    /** PDSs by domain, to tell which included results are complete. */
    knownPds?: ReadonlyMap<string, DiscoveredPds>;
    revealPartialResultsAfter: number;
    resolveRoutes: (
      routes: readonly string[],
    ) => Promise<readonly ResolvedRoute[]>;
  }) {
    this.#getConnection = options.getConnection;
    const { id, ...home } = options.home;
    this.#home = groupFederationTargets([options.home])[0] ?? {
      ...home,
      ids: [id],
    };
    this.#homeKey = federationTargetKey(this.#home);
    this.#include = options.include;
    this.#initialResponseTimeout = options.initialResponseTimeout;
    this.#request = options.request;
    this.#homeTarget = options.home;
    this.#knownPds = options.knownPds ?? new Map<string, DiscoveredPds>();
    this.#revealPartialResultsAfter = options.revealPartialResultsAfter;
    this.#resolveRoutes = options.resolveRoutes;
    this.#sources.set(this.#homeKey, {
      status: "pending",
      target: this.#home,
    });
    this.#snapshot = createFederatedSnapshot([...this.#sources.values()]);
    this.#startInitialResponseTimer(this.#homeKey, this.#home.url);
    this.#watchHome();
  }

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#routingGeneration += 1;
    if (this.#partialResultsTimer !== undefined) {
      clearTimeout(this.#partialResultsTimer);
    }
    for (const timer of this.#initialResponseTimers.values()) {
      clearTimeout(timer);
    }
    this.#initialResponseTimers.clear();
    for (const unsubscribe of this.#unsubscribes.values()) unsubscribe();
    this.#unsubscribes.clear();
    this.#listeners.clear();
  }

  #watchHome() {
    const client = new PdsClient({
      connection: this.#getConnection(this.#home.url, this.#home.domain),
    });
    const unsubscribe = client.watchQueryWithRouting(
      this.#request,
      ({ data, included, routes }) => {
        // Before the result itself, so a cache shows both at once.
        if (included.length > 0 || this.#included.length > 0) {
          this.#included = includedOnHome(
            included,
            this.#homeTarget,
            this.#knownPds,
          );
        }
        this.#update(this.#homeKey, { data, status: "live" });
        void this.#reconcileRoutes(routes).catch(() => {
          // The point query exposes route-discovery failures through its normal error result.
        });
      },
      (error) => this.#update(this.#homeKey, { error, status: "error" }),
      { include: this.#include },
    );
    this.#unsubscribes.set(this.#homeKey, unsubscribe);
  }

  async #reconcileRoutes(routes: readonly string[]) {
    const generation = ++this.#routingGeneration;
    const resolved = await this.#resolveRoutes(routes);
    if (this.#closed || generation !== this.#routingGeneration) return;

    const targets = groupFederationTargets([
      { ...this.#homeTarget, id: this.#home.ids[0] ?? this.#home.url },
      ...resolvedTargets(resolved),
    ]);
    // A route whose PDS can't be found counts as failed rather than holding
    // up the result, so a server that's gone doesn't stop the others.
    const unresolved = unresolvedSources(resolved);
    const removed = this.#removeStaleTargets([
      ...targets,
      ...unresolved.map(({ target }) => target),
    ]);
    const first = !this.#routesResolved;
    this.#routesResolved = true;
    const added = this.#addTargets(targets);
    const failed = this.#failTargets(unresolved);
    // Every update from home brings its routes; only a change to them
    // changes what this shows. Publishing again otherwise would show the
    // same result twice for every update.
    if (first || removed || added || failed) this.#publish();
  }

  /** Stops asking PDSes no longer routed to; whether there were any. */
  #removeStaleTargets(targets: readonly FederationTargetGroup[]) {
    const desired = new Set(targets.map(federationTargetKey));
    let removed = false;
    for (const key of this.#sources.keys()) {
      if (key === this.#homeKey || desired.has(key)) continue;
      this.#unsubscribes.get(key)?.();
      this.#unsubscribes.delete(key);
      this.#clearInitialResponseTimer(key);
      this.#sources.delete(key);
      removed = true;
    }
    return removed;
  }

  #addTargets(targets: readonly FederationTargetGroup[]) {
    const added = targets.filter((target) => {
      const key = federationTargetKey(target);
      return key !== this.#homeKey && !this.#unsubscribes.has(key);
    });
    for (const target of added) {
      const key = federationTargetKey(target);
      this.#sources.set(key, { status: "pending", target });
      this.#startInitialResponseTimer(key, target.url);
    }
    for (const target of added) {
      const key = federationTargetKey(target);
      const client = new PdsClient({
        connection: this.#getConnection(target.url, target.domain),
      });
      this.#unsubscribes.set(
        key,
        client.watchQuery(
          this.#request,
          (data) => this.#update(key, { data, status: "live" }),
          (error) => this.#update(key, { error, status: "error" }),
          { include: this.#include },
        ),
      );
    }
    return added.length > 0;
  }

  /** Records routes with no PDS to ask; whether any are new. */
  #failTargets(
    unresolved: readonly FederationSourceSnapshot<PdsRequestResult<Request>>[],
  ) {
    const failed = unresolved.filter(
      ({ target }) =>
        this.#sources.get(federationTargetKey(target))?.status !== "error",
    );
    for (const source of failed) {
      const key = federationTargetKey(source.target);
      this.#unsubscribes.get(key)?.();
      this.#unsubscribes.delete(key);
      this.#clearInitialResponseTimer(key);
      this.#sources.set(key, source);
    }
    return failed.length > 0;
  }

  #update(
    key: string,
    received:
      | { data: PdsRequestResult<Request>; status: "live" }
      | { error: Error; status: "error" },
  ) {
    if (this.#closed) return;
    const source = this.#sources.get(key);
    if (source === undefined) return;
    this.#clearInitialResponseTimer(key);
    // What this PDS is believed about, before anything combines it.
    const update =
      received.status === "live"
        ? tryTrustedAnswer(
            this.#request,
            received.data,
            sourceDomains(source.target),
            { home: key === this.#homeKey },
          )
        : received;
    this.#sources.set(
      key,
      update.status === "error" &&
        (source.status === "live" || source.status === "stale")
        ? {
            data: source.data,
            error: update.error,
            status: "stale",
            target: source.target,
          }
        : { ...update, target: source.target },
    );
    this.#publish();
  }

  #publish() {
    let snapshot: FederatedQuerySnapshot<
      Combined,
      PdsRequestResult<Request>
    > = {
      ...createFederatedSnapshot<PdsRequestResult<Request>, Combined>([
        ...this.#sources.values(),
      ]),
      included: this.#included,
    };

    if (!this.#routesResolved && snapshot.status !== "error") {
      snapshot = { ...snapshot, status: "pending" };
    }

    if (snapshot.status === "success") {
      this.#completedInitialLoad = true;
      this.#clearPartialResultsTimer();
    } else if (this.#completedInitialLoad) {
      snapshot = { ...snapshot, status: "success" };
    } else if (snapshot.status === "partial") {
      const remaining =
        this.#revealPartialResultsAfter - (Date.now() - this.#startedAt);
      if (remaining > 0) {
        this.#schedulePartialResults(remaining);
        return;
      }
    }

    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener();
  }

  #schedulePartialResults(delay: number) {
    if (this.#partialResultsTimer !== undefined) return;
    this.#partialResultsTimer = setTimeout(() => {
      this.#partialResultsTimer = undefined;
      this.#publish();
    }, delay);
  }

  #clearPartialResultsTimer() {
    if (this.#partialResultsTimer === undefined) return;
    clearTimeout(this.#partialResultsTimer);
    this.#partialResultsTimer = undefined;
  }

  #startInitialResponseTimer(key: string, url: string) {
    this.#initialResponseTimers.set(
      key,
      setTimeout(
        () =>
          this.#update(key, {
            error: new PdsInitialResponseTimeoutError(url),
            status: "error",
          }),
        this.#initialResponseTimeout,
      ),
    );
  }

  #clearInitialResponseTimer(key: string) {
    const timer = this.#initialResponseTimers.get(key);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.#initialResponseTimers.delete(key);
  }
}
