import type {
  AnyPdsQueryRequest,
  FederatedQueryStatus,
  FederationSourceSnapshot,
  PdsRequestResult,
} from "@decentralized-convex/client";
import type { DefaultError, UseQueryResult } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import { hashKey, useQuery, useQueryClient } from "@tanstack/react-query";
import { groupFederationTargets } from "@decentralized-convex/client";
import { useDecentralizedConvex } from "@decentralized-convex/react";

import type { FederatedPdsTanStackQueryOptions } from "./options.ts";

export type FederatedPdsTanStackQueryResult<Data, SourceResult> =
  UseQueryResult<Data, DefaultError> & {
    federation: {
      sources: readonly FederationSourceSnapshot<SourceResult>[];
      status: FederatedQueryStatus;
    };
  };

interface FederationState<SourceResult> {
  sources: readonly FederationSourceSnapshot<SourceResult>[];
  status: FederatedQueryStatus;
}

export function useFederatedPdsQuery<
  Request extends AnyPdsQueryRequest,
  Combined,
>(
  options: FederatedPdsTanStackQueryOptions<Request, Combined>,
): FederatedPdsTanStackQueryResult<Combined, PdsRequestResult<Request>> {
  const client = useDecentralizedConvex();
  const queryClient = useQueryClient();
  const queryHash = hashKey(options.queryKey);
  const [federation, setFederation] = useState<
    FederationState<PdsRequestResult<Request>>
  >(() => emptyFederation(options));
  const startObserver = useEffectEvent(() => client.watchPdsQuery(options));
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
      const snapshot = await client.pdsQuery(options);
      if (snapshot.status === "error") {
        throw new AggregateError(
          snapshot.sources.flatMap((source) => source.error ?? []),
          "Every PDS query target failed",
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

function emptyFederation<Request extends AnyPdsQueryRequest, Combined>(
  options: FederatedPdsTanStackQueryOptions<Request, Combined>,
): FederationState<PdsRequestResult<Request>> {
  const sources = groupFederationTargets(options.targets).map((target) => ({
    status: "pending" as const,
    target,
  }));
  return {
    sources,
    status: sources.length === 0 ? "success" : "pending",
  };
}
