import { createFileRoute } from "@tanstack/react-router";

import privacyPolicy from "~/app/_policy/privacy-policy.md?raw";

export const Route = createFileRoute("/_policy/privacy-policy")({
  loader: () => privacyPolicy,
});
