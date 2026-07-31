import { useSuspenseQuery } from "@tanstack/react-query";

import { billingQueries } from "@acme/features/billing";

import { UsageCountdown } from "./usage-countdown";
import { UsageUpgradeCallout } from "./usage-upgrade-callout";

export function UsageChatCallout({ hide }: { hide?: boolean }) {
  const { data: limitHit } = useSuspenseQuery({
    ...billingQueries.usage(),
    select: (data) => data.limitHit,
  });

  if (!limitHit) return null;
  if (hide) return null;

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="text-lg font-bold text-red-400">
        You&apos;ve reached your usage limit.
      </span>
      <UsageCountdown />
      <UsageUpgradeCallout />
    </div>
  );
}
