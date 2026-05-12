import aggregate from "@convex-dev/aggregate/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import resend from "@convex-dev/resend/convex.config";
import shardedCounter from "@convex-dev/sharded-counter/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();

app.use(migrations);
app.use(rateLimiter);
app.use(shardedCounter);
app.use(resend);

app.use(aggregate, { name: "aggregateUsage" });
app.use(aggregate, { name: "aggregateStorage" });

export default app;
