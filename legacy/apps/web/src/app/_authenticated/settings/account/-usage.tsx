import { useSuspenseQuery } from "@tanstack/react-query";

import { billingQueries } from "@acme/features/billing";
import { Card, CardContent } from "@acme/ui/card";

import { UsageCountdown } from "~/features/billing/components/usage-countdown";
import { UsageProgress } from "~/features/billing/components/usage-progress";
import { UsageUpgradeCallout } from "~/features/billing/components/usage-upgrade-callout";

export function Usage() {
  const { data: unlimited } = useSuspenseQuery({
    ...billingQueries.usage(),
    select: (data) => data.unlimited,
  });

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-bold">Usage</h1>
        {unlimited ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-muted-foreground text-sm">
              You have unlimited usage.
            </p>
          </div>
        ) : (
          <>
            <UsageProgress />
            <div className="flex flex-col items-center gap-2">
              <UsageCountdown />
              <UsageUpgradeCallout />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
