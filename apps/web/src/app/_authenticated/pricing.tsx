import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-react-start";
import ReactMarkdown from "react-markdown";

import { billingQueries } from "@acme/features/billing";
import { Button } from "@acme/ui/button";
import * as Card from "@acme/ui/card";

import { markdownComponents } from "~/features/messages/components/markdown-components";
import { createCheckoutUrl, getCustomerPortalUrl } from "~/lib/billing";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/_authenticated/pricing")({
  component: PricingCards,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(billingQueries.listAllProducts()),
      context.queryClient.ensureQueryData(billingQueries.currentPlan()),
    ]);
  },
});

interface Product {
  name: string;
  id: string;
  description: string;
  price: number;
  period: "month" | "year" | undefined | null;
}

function getPlanStyle(name: string) {
  switch (name) {
    case "Premium":
      return {
        border: "border-premium shadow-premium/10 shadow-xl",
        text: "text-premium",
      };
    case "Ultra":
      return {
        border: "border-ultra shadow-ultra/10 shadow-xl",
        text: "text-ultra",
      };
    case "Light":
      return {
        border: "border-light shadow-light/10 shadow-xl",
        text: "text-light",
      };
  }
}

function formatPrice(price: number, period: Product["period"]) {
  if (price === 0) return "Free";
  return `$${price / 100} ${period ? `/ ${period}` : ""}`;
}

function ProductCard({
  product,
  showCheckout,
  onCheckout,
  loading,
}: {
  product: Product;
  showCheckout: boolean;
  onCheckout: (productId: string) => void;
  loading: boolean;
}) {
  const style = getPlanStyle(product.name);

  return (
    <Card.Card className={cn("w-full max-w-96 xl:w-96", style?.border)}>
      <Card.CardHeader className="sr-only">
        <Card.CardTitle>{product.name}</Card.CardTitle>
      </Card.CardHeader>
      <Card.CardContent className="w-full max-w-96 xl:w-96">
        <div className="flex items-center gap-2">
          <span className={cn("text-2xl font-bold", style?.text)}>
            {product.name}
          </span>
          <span className="text-muted-foreground">
            {formatPrice(product.price, product.period)}
          </span>
        </div>
        <div className="prose dark:prose-invert relative min-h-[250px] w-full max-w-full">
          <ReactMarkdown components={markdownComponents}>
            {product.description}
          </ReactMarkdown>
        </div>
        {product.price !== 0 && showCheckout && (
          <Button
            className="w-full"
            onClick={() => onCheckout(product.id)}
            disabled={loading}
          >
            Upgrade
          </Button>
        )}
      </Card.CardContent>
    </Card.Card>
  );
}

function usePlans() {
  const { data: allPlans } = useSuspenseQuery({
    ...billingQueries.listAllProducts(),
    select: (data) =>
      data.map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        prices: plan.prices,
        recurringInterval: plan.recurringInterval,
        isArchived: plan.isArchived,
      })),
  });

  const plans = allPlans
    .filter((plan) => plan.isArchived === false)
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description ?? "",
      price: plan.prices[0]?.priceAmount ?? 0,
      period: plan.recurringInterval,
    }))
    .sort((a, b) => a.price - b.price);

  return { plans };
}

export function PricingCards() {
  const { plans } = usePlans();
  const { data: myPlan } = useSuspenseQuery({
    ...billingQueries.currentPlan(),
    select: (data) => data,
  });
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleCheckout(productId?: string) {
    setLoading(true);
    const token = await getToken({ template: "convex" });
    if (!token) {
      setLoading(false);
      return;
    }
    const url = await createCheckoutUrl(token, productId);
    setLoading(false);
    if (url) location.assign(url);
  }

  async function handleManageSubscription() {
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

  const hasPlan = myPlan.name !== "Free";

  return (
    <div className="my-8 flex min-h-screen w-full flex-col items-center justify-center gap-4 xl:my-0">
      <span className="text-2xl font-bold">Pricing</span>
      {hasPlan ? (
        <div className="flex min-h-20 flex-col items-center gap-2">
          <span>
            Current plan:{" "}
            <span className="text-primary font-bold">{myPlan.name}</span>
          </span>
          <Button
            className="animate-in fade-in duration-300"
            onClick={handleManageSubscription}
            disabled={loading}
          >
            Manage subscription
          </Button>
        </div>
      ) : (
        <span className="text-muted-foreground mb-2">
          Choose a plan to get started.
        </span>
      )}
      <div className="flex flex-col items-center gap-6">
        <div className="mx-4 flex flex-col gap-4 xl:flex-row">
          {plans.map((plan) => (
            <ProductCard
              key={plan.id}
              product={plan}
              showCheckout={!hasPlan}
              onCheckout={handleCheckout}
              loading={loading}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
