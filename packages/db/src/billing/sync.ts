import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { getPolarClient } from "./client";
import { ACTIVE_SUBSCRIPTION_STATUSES, parsePlanName } from "./plans";

export async function syncSubscriptionImpl(
  ctx: ActionCtx,
  polarCustomerId: string,
) {
  const polar = getPolarClient();

  const customer = await ctx.runQuery(
    internal.billing.queries.customerByPolarId,
    { polarCustomerId },
  );
  if (!customer) {
    const polarCustomer = await polar.customers.get({ id: polarCustomerId });
    const userId = polarCustomer.metadata.userId;
    if (typeof userId !== "string") {
      console.error(
        "[BILLING SYNC] No userId in customer metadata:",
        polarCustomerId,
      );
      return;
    }
    await ctx.runMutation(internal.billing.mutations.upsertCustomer, {
      userId,
      polarCustomerId,
      email: polarCustomer.email ?? "",
    });
  }

  const result = await polar.subscriptions.list({
    customerId: polarCustomerId,
    limit: 10,
  });

  const subscriptions = [];
  for await (const page of result) {
    subscriptions.push(...page.result.items);
  }

  const activeSub = subscriptions.find((sub) =>
    ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status),
  );

  if (!activeSub) {
    await ctx.runMutation(
      internal.billing.mutations.deleteSubscriptionByCustomer,
      { polarCustomerId },
    );
    return;
  }

  const planName = parsePlanName(activeSub.product.name);

  await ctx.runMutation(internal.billing.mutations.upsertSubscription, {
    polarCustomerId,
    polarSubscriptionId: activeSub.id,
    planName,
    status: activeSub.status,
    currentPeriodEnd: activeSub.currentPeriodEnd.getTime(),
    cancelAtPeriodEnd: activeSub.cancelAtPeriodEnd,
  });
}
