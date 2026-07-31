import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { api } from "@acme/db/api";
import { billingQueries } from "@acme/features/billing";

export const Route = createFileRoute("/_authenticated")({
  component: () => <Outlet />,
  beforeLoad: async ({ context, location }) => {
    const { auth } = context;
    if (!auth.isSignedIn) {
      throw redirect({
        to: "/sign-in",
        search: { signin: true, redirect_url: location.href },
      });
    }

    await context.convexHttpClient.mutation(
      api.user.account.ensureUserExists,
      {},
    );

    return { auth };
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(billingQueries.usage());
  },
});
