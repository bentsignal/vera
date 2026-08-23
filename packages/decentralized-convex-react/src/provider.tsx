import type { FederationClientOptions } from "@decentralized-convex/client";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { DecentralizedConvexClient } from "@decentralized-convex/client";

const ClientContext = createContext<DecentralizedConvexClient | undefined>(
  undefined,
);

export interface DecentralizedConvexProviderProps extends PropsWithChildren {
  client?: DecentralizedConvexClient;
  options?: FederationClientOptions;
}

export function DecentralizedConvexProvider({
  children,
  client,
  options,
}: DecentralizedConvexProviderProps) {
  const [value] = useState(
    () => client ?? new DecentralizedConvexClient(options),
  );

  useEffect(() => {
    if (client !== undefined) return;
    return () => void value.close();
  }, [client, value]);

  return <ClientContext value={value}>{children}</ClientContext>;
}

export function useDecentralizedConvex() {
  const client = useContext(ClientContext);
  if (client === undefined) {
    throw new Error(
      "useDecentralizedConvex must be used inside DecentralizedConvexProvider",
    );
  }
  return client;
}
