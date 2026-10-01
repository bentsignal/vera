import type { PropsWithChildren } from "react";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import {
  getContext,
  RootProvider,
} from "./integrations/tanstack-query/root-provider.tsx";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const context = getContext();

  function Providers({ children }: PropsWithChildren) {
    return <RootProvider context={context}>{children}</RootProvider>;
  }

  const router = createTanStackRouter({
    Wrap: Providers,
    context,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    routeTree,
    scrollRestoration: true,
  });

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
