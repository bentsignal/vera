import { v } from "convex/values";

import { action } from "./_generated/server";
import { requireCaller } from "./devBots";
import { seedBusy } from "./devFullSeed";
import { seedProfiles } from "./devSeed";

// Development only (see dev.ts): one long, lively group with every bot,
// for measuring what a busy conversation costs to open and follow
// (.plans/data-pass.md):
// `npx convex run devBusy:seed '{"count":600,"livened":300,"secret":"…"}' --identity …`,
// with the secret from scripts/dev-tools-secret.sh.

export const seed = action({
  args: { count: v.number(), livened: v.number(), secret: v.string() },
  handler: async (ctx, { count, livened, secret }) => {
    const caller = await requireCaller(ctx, secret);
    await seedProfiles(ctx);
    return seedBusy(
      ctx,
      { address: caller.accountId, name: caller.name },
      { count, livened },
    );
  },
});
