import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/tanstack-react-start";

import { billingQueries } from "@acme/features/billing";
import { Button } from "@acme/ui/button";

import { InfoCard } from "~/components/info-card";
import { QuickLink as Link } from "~/features/quick-link/quick-link";
import { createCheckoutUrl, getCustomerPortalUrl } from "~/lib/billing";

export function Billing() {
  const { data: usersPlan } = useSuspenseQuery({
    ...billingQueries.currentPlan(),
    select: (data) => data,
  });
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    setLoading(true);
    const token = await getToken({ template: "convex" });
    if (!token) {
      setLoading(false);
      return;
    }
    const url = await createCheckoutUrl(token);
    setLoading(false);
    if (url) location.assign(url);
  }

  async function handleManage() {
    setLoading(true);
    const token = await getToken({ template: "convex" });
    if (!token) {
      setLoading(false);
      return;
    }
    const url = await getCustomerPortalUrl(token);
    setLoading(false);
    if (url) location.assign(url);
  }

  const hasPlan = usersPlan.name !== "Free";

  return (
    <InfoCard title="Billing">
      <div className="flex flex-col gap-4">
        <div className="flex gap-1">
          <span className="text-foreground font-bold">Current plan:</span>
          <span>{usersPlan.name}</span>
        </div>
        <div className="flex gap-2">
          <Link to="/pricing">
            <Button variant="outline">View plans</Button>
          </Link>
          {hasPlan ? (
            <Button onClick={handleManage} disabled={loading}>
              Manage subscription
            </Button>
          ) : (
            <Button onClick={handleUpgrade} disabled={loading}>
              Upgrade
            </Button>
          )}
        </div>
      </div>
    </InfoCard>
  );
}
