import type {
  FederatedQueryStatus,
  FederationQueryReference,
  FederationSourceSnapshot,
} from "@decentralized-convex/client";
import type { DefaultError, UseQueryResult } from "@tanstack/react-query";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useEffectEvent, useState } from "react";
import { hashKey, useQuery, useQueryClient } from "@tanstack/react-query";
import { groupFederationTargets } from "@decentralized-convex/client";
import { useDecentralizedConvex } from "@decentralized-convex/react";

import type { FederatedTanStackQueryOptions } from "./options.ts";

export type FederatedTanStackQueryResult<Data, SourceResult> = UseQueryResult<
  Data,
  DefaultError
> & {
  federation: {
    sources: readonly FederationSourceSnapshot<SourceResult>[];
    status: FederatedQueryStatus;
  };
};

interface FederationState<SourceResult> {
  sources: readonly FederationSourceSnapshot<SourceResult>[];
  status: FederatedQueryStatus;
}

export function useFederatedQuery<
  Query extends FederationQueryReference,
  Combined,
>(
  options: FederatedTanStackQueryOptions<Query, Combined>,
): FederatedTanStackQueryResult<Combined, FunctionReturnType<Query>> {
  const client = useDecentralizedConvex();
  const queryClient = useQueryClient();
  const queryHash = hashKey(options.queryKey);
  const [federation, setFederation] = useState<
    FederationState<FunctionReturnType<Query>>
  >(() => emptyFederation(options));
  const startObserver = useEffectEvent(() => client.watchQuery(options));
  const publish = useEffectEvent(
    (snapshot: ReturnType<ReturnType<typeof startObserver>["getSnapshot"]>) => {
      setFederation({ sources: snapshot.sources, status: snapshot.status });
      if (snapshot.status === "success" || snapshot.status === "partial") {
        queryClient.setQueryData(options.queryKey, snapshot.data);
      }
    },
  );

  const query = useQuery({
    enabled: options.enabled,
    queryFn: async () => {
      const snapshot = await client.query(options);
      if (snapshot.status === "error") {
        throw new AggregateError(
          snapshot.sources.flatMap((source) =>
            source.status === "error" ? [source.error] : [],
          ),
          "Every federation target failed",
        );
      }
      return snapshot.data;
    },
    queryKey: options.queryKey,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (options.enabled === false) return;
    const observer = startObserver();
    function publishCurrent() {
      publish(observer.getSnapshot());
    }
    publishCurrent();
    const unsubscribe = observer.subscribe(publishCurrent);
    return () => {
      unsubscribe();
      observer.close();
    };
  }, [options.enabled, queryHash]);

  return {
    ...query,
    federation: {
      sources: federation.sources,
      status: federation.status,
    },
  };
}

function emptyFederation<Query extends FederationQueryReference, Combined>(
  options: FederatedTanStackQueryOptions<Query, Combined>,
): FederationState<FunctionReturnType<Query>> {
  const sources = groupFederationTargets(options.targets).map((target) => ({
    status: "pending" as const,
    target,
  }));
  return {
    sources,
    status: sources.length === 0 ? "success" : "pending",
  };
}
