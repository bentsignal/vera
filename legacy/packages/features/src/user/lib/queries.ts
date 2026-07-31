import { queryOptions } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";

import { api } from "@acme/db/api";

export const userQueries = {
  info: () =>
    queryOptions({
      ...convexQuery(api.user.info.get, {}),
    }),
  email: () =>
    queryOptions({
      ...convexQuery(api.user.account.getEmail, {}),
    }),
  showModelSelector: () =>
    queryOptions({
      ...convexQuery(api.user.subscription.showModelSelector, {}),
    }),
};
