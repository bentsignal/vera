import { createFileRoute } from "@tanstack/react-router";

import { billingQueries } from "@acme/features/billing";
import { userQueries } from "@acme/features/user";

import { SettingsWrapper } from "./-wrapper";
import { AccountInfo } from "./account/-account-info";
import { Billing } from "./account/-billing";
import { DeleteAccount } from "./account/-delete";
import { Usage } from "./account/-usage";

export const Route = createFileRoute("/_authenticated/settings/account")({
  component: AccountPage,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(billingQueries.usage()),
      context.queryClient.ensureQueryData(billingQueries.currentPlan()),
      context.queryClient.ensureQueryData(userQueries.email()),
      context.queryClient.ensureQueryData(billingQueries.listAllProducts()),
    ]);
  },
});

function AccountPage() {
  return (
    <SettingsWrapper>
      <Usage />
      <Billing />
      <AccountInfo />
      <DeleteAccount />
    </SettingsWrapper>
  );
}
