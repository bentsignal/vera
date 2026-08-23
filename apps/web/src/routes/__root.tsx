import { createRootRouteWithContext } from "@tanstack/react-router";

import type { getContext } from "../integrations/tanstack-query/root-provider.tsx";
import { NotFound } from "../shell/NotFound.tsx";
import { RootDocument } from "../shell/RootDocument.tsx";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<
  ReturnType<typeof getContext>
>()({
  head: () => ({
    links: [{ href: appCss, rel: "stylesheet" }],
    meta: [
      { charSet: "utf-8" },
      {
        content: "width=device-width, initial-scale=1",
        name: "viewport",
      },
      { title: "Vera" },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});
