import { createFileRoute } from "@tanstack/react-router";

import { userQueries } from "@acme/features/user";

import { Shortcuts } from "~/features/shortcuts/components/shortcuts";
import { SettingsWrapper } from "./-wrapper";
import { Appearance } from "./preferences/-appearance";
import { Bangs } from "./preferences/-bangs";
import { Personalization } from "./preferences/-personalization";

export const Route = createFileRoute("/_authenticated/settings/preferences")({
  component: PreferencesPage,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(userQueries.info()),
      context.queryClient.ensureQueryData(userQueries.showModelSelector()),
    ]);
  },
});

function PreferencesPage() {
  return (
    <SettingsWrapper>
      <Appearance />
      <Personalization />
      <Shortcuts />
      <Bangs />
    </SettingsWrapper>
  );
}
