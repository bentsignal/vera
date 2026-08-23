import type { FunctionReturnType } from "convex/server";

import type {
  FederatedQueryOptions,
  FederatedQuerySnapshot,
  FederationConnection,
  FederationQueryReference,
  FederationSourceSnapshot,
} from "./types.ts";
import { createFederatedSnapshot } from "./snapshot.ts";
import { groupFederationTargets } from "./targets.ts";

export class FederatedQueryObserver<
  Query extends FederationQueryReference,
  Combined,
> {
  readonly #listeners = new Set<() => void>();
  readonly #options;
  readonly #sources = new Map<
    string,
    FederationSourceSnapshot<FunctionReturnType<Query>>
  >();
  readonly #unsubscribes: (() => void)[] = [];
  #closed = false;
  #snapshot: FederatedQuerySnapshot<Combined, FunctionReturnType<Query>>;

  constructor(
    options: FederatedQueryOptions<Query, Combined>,
    getConnection: (url: string) => FederationConnection,
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
      const connection = getConnection(target.url);
      const args =
        typeof options.args === "function"
          ? options.args(target)
          : options.args;
      const unsubscribe = connection.subscribe(
        options.query,
        args,
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
    update:
      | { data: FunctionReturnType<Query>; status: "live" }
      | { error: Error; status: "error" },
  ) {
    if (this.#closed) return;
    const source = this.#sources.get(url);
    if (source === undefined) return;
    this.#sources.set(
      url,
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
