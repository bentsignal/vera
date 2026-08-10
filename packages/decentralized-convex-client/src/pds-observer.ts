import type {
  AnyPdsQueryRequest,
  FederatedPdsQueryOptions,
  PdsConnection,
  PdsRequestResult,
} from "./pds.ts";
import type {
  FederatedQuerySnapshot,
  FederationSourceSnapshot,
} from "./types.ts";
import { PdsClient } from "./pds.ts";
import { createFederatedSnapshot } from "./snapshot.ts";
import { groupFederationTargets } from "./targets.ts";

export class FederatedPdsQueryObserver<
  Request extends AnyPdsQueryRequest,
  Combined,
> {
  readonly #listeners = new Set<() => void>();
  readonly #options;
  readonly #sources = new Map<
    string,
    FederationSourceSnapshot<PdsRequestResult<Request>>
  >();
  readonly #unsubscribes: (() => void)[] = [];
  #closed = false;
  #snapshot: FederatedQuerySnapshot<Combined, PdsRequestResult<Request>>;

  constructor(
    options: FederatedPdsQueryOptions<Request, Combined>,
    getConnection: (url: string) => PdsConnection,
  ) {
    this.#options = options;
    const targets = groupFederationTargets(options.targets);
    for (const target of targets) {
      this.#sources.set(target.url, { status: "pending", target });
    }
    this.#snapshot = createFederatedSnapshot(
      [...this.#sources.values()],
      options.combine,
    );

    for (const target of targets) {
      const request =
        typeof options.request === "function"
          ? options.request(target)
          : options.request;
      const client = new PdsClient({ connection: getConnection(target.url) });
      const unsubscribe = client.watchQuery(
        request,
        (data) => this.#update(target.url, { data, status: "live" }),
        (error) => this.#update(target.url, { error, status: "error" }),
      );
      this.#unsubscribes.push(unsubscribe);
    }
  }

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  close() {
    if (this.#closed) return;
    this.#closed = true;
    for (const unsubscribe of this.#unsubscribes) unsubscribe();
    this.#unsubscribes.length = 0;
    this.#listeners.clear();
  }

  #update(
    url: string,
    patch: Partial<FederationSourceSnapshot<PdsRequestResult<Request>>>,
  ) {
    if (this.#closed) return;
    const source = this.#sources.get(url);
    if (source === undefined) return;
    this.#sources.set(url, { ...source, ...patch });
    this.#snapshot = createFederatedSnapshot(
      [...this.#sources.values()],
      this.#options.combine,
    );
    for (const listener of this.#listeners) listener();
  }
}
