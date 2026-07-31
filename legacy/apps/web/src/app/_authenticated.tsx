import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { api } from "@acme/db/api";
import { billingQueries } from "@acme/features/billing";
import { threadQueries } from "@acme/features/thread";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@acme/ui/sidebar";

import { ChatSidebar } from "~/app/_authenticated/-chat-sidebar";
import { Library } from "~/features/library/library";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
  beforeLoad: async ({ context, location }) => {
    const { auth } = context;
    if (!auth.isSignedIn) {
      throw redirect({
        to: "/",
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
    await Promise.all([
      context.queryClient.ensureQueryData(threadQueries.listFirstPage()),
      context.queryClient.ensureQueryData(billingQueries.usage()),
      context.queryClient.ensureQueryData(billingQueries.currentPlan()),
    ]);
  },
});

function AuthenticatedLayout() {
  const isSidebarOpen = Route.useRouteContext({
    select: (ctx) => ctx.cookies.sidebarOpen,
  });

  return (
    <SidebarProvider defaultOpen={isSidebarOpen}>
      <ChatSidebar />
      <Library />
      <SidebarInset className="relative h-screen">
        <div className="absolute top-0 right-0 left-0 z-20 flex w-full items-center justify-between">
          <SidebarTrigger className="m-4 border p-5 shadow-md" />
        </div>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
