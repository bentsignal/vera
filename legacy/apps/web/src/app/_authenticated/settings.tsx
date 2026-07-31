import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SidebarProvider } from "@acme/ui/sidebar";

import { SettingsNavDesktop, SettingsNavMobile } from "./settings/-nav";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <SidebarProvider>
      <div className="mx-auto flex w-screen max-w-[1200px] flex-col gap-4 px-4 pt-8 sm:max-h-screen md:flex-row md:pt-30">
        <SettingsNavMobile />
        <SettingsNavDesktop />
        <main className="flex flex-1 flex-col items-center">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
