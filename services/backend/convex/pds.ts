import { definePdsRouter } from "@decentralized-convex/server";

import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";

export const { dispatchMutation, dispatchQuery } = definePdsRouter({
  components,
  mutation,
  query,
});
