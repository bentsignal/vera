import { definePdsRouter } from "@decentralized-convex/server";

import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { afterPdsMutation } from "./assistantHook";
import { optionalEnvironment, requireEnvironment } from "./lib";
import { limitSends } from "./sendLimits";

export const { dispatchMutation, dispatchQuery } = definePdsRouter({
  // This PDS's own accounts; anyone else is a visitor (identity.home).
  accountDomain: () => requireEnvironment("FEDERATION_DOMAIN"),
  // Messages to Vera's assistant accounts start their replies.
  afterMutation: afterPdsMutation,
  // How fast one person, and one visiting server, can send.
  beforeMutation: limitSends,
  components,
  mutation,
  query,
  // Set PDS_TRACE=1 to see what each request was for in the logs (for
  // measuring what each operation costs; see scripts/perf).
  trace: () => optionalEnvironment("PDS_TRACE") === "1",
});
