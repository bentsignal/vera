import { queryOptions } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";

import { api } from "@acme/db/api";

export const homeQueries = {
  suggestions: () =>
    queryOptions({
      ...convexQuery(api.ai.suggestions.getCurrent, {}),
    }),
};
