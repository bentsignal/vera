import { createFileRoute } from "@tanstack/react-router";
import { createRouteHandler } from "uploadthing/server";

import { ourFileRouter } from "./uploadthing/-core";

const handlers = createRouteHandler({
  router: ourFileRouter,
});

export const Route = createFileRoute("/api/uploadthing")({
  server: {
    handlers: {
      GET: async ({ request }) => handlers(request),
      POST: async ({ request }) => handlers(request),
    },
  },
});
