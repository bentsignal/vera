import { createFileRoute } from "@tanstack/react-router";

import tos from "~/app/_policy/tos.md?raw";

export const Route = createFileRoute("/_policy/terms-of-service")({
  loader: () => tos,
});
