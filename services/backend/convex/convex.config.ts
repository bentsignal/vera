import betterAuth from "@convex-dev/better-auth/convex.config";
import accounts from "@decentralized-convex/accounts/convex.config";
import messages from "@decentralized-convex/messages/convex.config";
import { definePdsApp } from "@decentralized-convex/server";

export default definePdsApp({
  components: [betterAuth],
  plugins: [accounts, messages],
});
