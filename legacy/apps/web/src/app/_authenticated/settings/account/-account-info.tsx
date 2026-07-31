import { useSuspenseQuery } from "@tanstack/react-query";

import { userQueries } from "@acme/features/user";

import { InfoCard } from "~/components/info-card";

export function AccountInfo() {
  const { data: email } = useSuspenseQuery({
    ...userQueries.email(),
    select: (data) => data,
  });

  if (email === null) {
    return null;
  }

  return (
    <InfoCard title="Information">
      <div className="flex gap-1">
        <span className="text-foreground font-bold">Email:</span>
        <span className="">{email}</span>
      </div>
    </InfoCard>
  );
}
