import { queryOptions } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";

import { api } from "@acme/db/api";

export const billingQueries = {
  usage: () =>
    queryOptions({
      ...convexQuery(api.user.usage.getUsage, {}),
    }),
  currentPlan: () =>
    queryOptions({
      ...convexQuery(api.user.subscription.getPlan, {}),
    }),
  listAllProducts: () =>
    queryOptions({
      ...convexQuery(api.billing.queries.listProducts, {}),
    }),
};
