import betterAuth from "@convex-dev/better-auth/convex.config";
import accounts from "@decentralized-convex/accounts/convex.config";
import messages from "@decentralized-convex/messages/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(betterAuth);
app.use(accounts);
app.use(messages);

export default app;
