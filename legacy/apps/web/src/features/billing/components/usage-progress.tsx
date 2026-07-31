import { useSuspenseQuery } from "@tanstack/react-query";

import { billingQueries } from "@acme/features/billing";
import { Progress } from "@acme/ui/progress";

export function UsageProgress() {
  const { data: usage } = useSuspenseQuery({
    ...billingQueries.usage(),
    select: (data) => ({
      percentageUsed: data.percentageUsed,
      range: data.range,
    }),
  });
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <h3 className="text-muted-foreground">
        You have used{" "}
        <span className="text-foreground font-bold">
          {usage.percentageUsed.toFixed(2)}%
        </span>{" "}
        of your {usage.range} limit
      </h3>
      <Progress value={usage.percentageUsed} className="w-full max-w-[300px]" />
    </div>
  );
}
