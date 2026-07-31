import { useSuspenseQuery } from "@tanstack/react-query";

import { billingQueries } from "@acme/features/billing";

import { QuickLink as Link } from "~/features/quick-link/quick-link";

export function UsageUpgradeCallout() {
  const { data: atMax } = useSuspenseQuery({
    ...billingQueries.currentPlan(),
    select: (data) => data.max,
  });
  if (atMax) return null;
  return (
    <span className="text-muted-foreground text-sm">
      <Link to="/pricing" className="text-primary font-bold underline">
        Upgrade
      </Link>{" "}
      to increase your limits.
    </span>
  );
}
