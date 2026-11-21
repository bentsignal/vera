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
import { federationTargetKey, groupFederationTargets } from "./targets.ts";
import { sourceDomains, tryTrustedAnswer } from "./trust.ts";

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
    getConnection: (url: string, domain?: string) => PdsConnection,
  ) {
    this.#options = options;
    const targets = groupFederationTargets(options.targets);
    for (const target of targets) {
      this.#sources.set(federationTargetKey(target), {
        status: "pending",
        target,
      });
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
      const key = federationTargetKey(target);
      const client = new PdsClient({
        connection: getConnection(target.url, target.domain),
      });
      const unsubscribe = client.watchQuery(
        request,
        (data) =>
          this.#update(key, {
            ...tryTrustedAnswer(request, data, sourceDomains(target), {
              home: false,
            }),
          }),
        (error) => this.#update(key, { error, status: "error" }),
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
    key: string,
    update:
      | { data: PdsRequestResult<Request>; status: "live" }
      | { error: Error; status: "error" },
  ) {
    if (this.#closed) return;
    const source = this.#sources.get(key);
    if (source === undefined) return;
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
    this.#snapshot = createFederatedSnapshot(
      [...this.#sources.values()],
      this.#options.combine,
    );
    for (const listener of this.#listeners) listener();
  }
}
