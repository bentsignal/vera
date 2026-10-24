import { definePdsRouter } from "@decentralized-convex/server";

import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { afterPdsMutation } from "./assistantHook";
import { limitSends } from "./sendLimits";

export const { dispatchMutation, dispatchQuery } = definePdsRouter({
  // Messages to Vera's assistant accounts start their replies.
  afterMutation: afterPdsMutation,
  // How fast one person can send.
  beforeMutation: limitSends,
  components,
  mutation,
  query,
});
