import { useSuspenseQuery } from "@tanstack/react-query";

import { billingQueries } from "@acme/features/billing";
import { useCountdown } from "@acme/features/hooks";
import { formatCountdownString } from "@acme/features/lib/date-time-utils";

export function UsageCountdown() {
  const { data: endOfPeriod } = useSuspenseQuery({
    ...billingQueries.usage(),
    select: (data) => data.endOfPeriod,
  });
  const { minutes, hours, days } = useCountdown({
    target: new Date(endOfPeriod),
    updateInterval: 1,
  });
  const timeRemaining = formatCountdownString(days, hours, minutes);
  return (
    <span className="text-sm">
      Your limit will reset in{" "}
      <span className="font-bold whitespace-nowrap">{timeRemaining}</span>
    </span>
  );
}
