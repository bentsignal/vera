import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function getContext() {
  return { queryClient: new QueryClient() };
}

export interface RootProviderProps extends PropsWithChildren {
  context: ReturnType<typeof getContext>;
}

export function RootProvider({ children, context }: RootProviderProps) {
  return (
    <QueryClientProvider client={context.queryClient}>
      {children}
    </QueryClientProvider>
  );
}
