import type {
  AnyPdsQueryRequest,
  DefaultCombinedPdsResult,
  PdsConnection,
  PdsRequestResult,
} from "./pds.ts";
import type {
  FederatedQuerySnapshot,
  FederationSourceSnapshot,
  FederationTarget,
} from "./types.ts";
import { PdsClient } from "./pds.ts";
import { createFederatedSnapshot } from "./snapshot.ts";
import { groupFederationTargets } from "./targets.ts";

export class RoutedPdsQueryObserver<
  Request extends AnyPdsQueryRequest,
  Combined = DefaultCombinedPdsResult<Request>,
> {
  readonly #getConnection;
  readonly #home;
  readonly #listeners = new Set<() => void>();
  readonly #request;
  readonly #resolveRoutes;
  readonly #sources = new Map<
    string,
    FederationSourceSnapshot<PdsRequestResult<Request>>
  >();
  readonly #unsubscribes = new Map<string, () => void>();
  #closed = false;
  #routingGeneration = 0;
  #snapshot: FederatedQuerySnapshot<Combined, PdsRequestResult<Request>>;

  constructor(options: {
    getConnection: (url: string) => PdsConnection;
    home: FederationTarget;
    request: Request;
    resolveRoutes: (
      routes: readonly string[],
    ) => Promise<readonly FederationTarget[]>;
  }) {
    this.#getConnection = options.getConnection;
    this.#home = groupFederationTargets([options.home])[0] ?? {
      ids: [options.home.id],
      url: options.home.url,
    };
    this.#request = options.request;
    this.#resolveRoutes = options.resolveRoutes;
    this.#sources.set(this.#home.url, {
      status: "pending",
      target: this.#home,
    });
    this.#snapshot = createFederatedSnapshot([...this.#sources.values()]);
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
    for (const unsubscribe of this.#unsubscribes.values()) unsubscribe();
    this.#unsubscribes.clear();
    this.#listeners.clear();
  }

  #watchHome() {
    const client = new PdsClient({
      connection: this.#getConnection(this.#home.url),
    });
    const unsubscribe = client.watchQueryWithRouting(
      this.#request,
      ({ data, routes }) => {
        this.#update(this.#home.url, { data, status: "live" });
        void this.#reconcileRoutes(routes).catch(() => {
          // The point query exposes route-discovery failures through its normal error result.
        });
      },
      (error) => this.#update(this.#home.url, { error, status: "error" }),
    );
    this.#unsubscribes.set(this.#home.url, unsubscribe);
  }

  async #reconcileRoutes(routes: readonly string[]) {
    const generation = ++this.#routingGeneration;
    const resolved = await this.#resolveRoutes(routes);
    if (this.#closed || generation !== this.#routingGeneration) return;

    const targets = groupFederationTargets([
      { id: this.#home.ids[0] ?? this.#home.url, url: this.#home.url },
      ...resolved,
    ]);
    this.#removeStaleTargets(targets);
    this.#addTargets(targets);
    this.#publish();
  }

  #removeStaleTargets(targets: readonly { readonly url: string }[]) {
    const desiredUrls = new Set(targets.map(({ url }) => url));
    for (const url of this.#sources.keys()) {
      if (url === this.#home.url || desiredUrls.has(url)) continue;
      this.#unsubscribes.get(url)?.();
      this.#unsubscribes.delete(url);
      this.#sources.delete(url);
    }
  }

  #addTargets(
    targets: readonly {
      readonly ids: readonly string[];
      readonly url: string;
    }[],
  ) {
    for (const target of targets) {
      if (target.url === this.#home.url || this.#sources.has(target.url)) {
        continue;
      }
      this.#sources.set(target.url, { status: "pending", target });
      const client = new PdsClient({
        connection: this.#getConnection(target.url),
      });
      this.#unsubscribes.set(
        target.url,
        client.watchQuery(
          this.#request,
          (data) => this.#update(target.url, { data, status: "live" }),
          (error) => this.#update(target.url, { error, status: "error" }),
        ),
      );
    }
  }

  #update(
    url: string,
    patch: Partial<FederationSourceSnapshot<PdsRequestResult<Request>>>,
  ) {
    if (this.#closed) return;
    const source = this.#sources.get(url);
    if (source === undefined) return;
    this.#sources.set(url, { ...source, ...patch });
    this.#publish();
  }

  #publish() {
    this.#snapshot = createFederatedSnapshot([...this.#sources.values()]);
    for (const listener of this.#listeners) listener();
  }
}
