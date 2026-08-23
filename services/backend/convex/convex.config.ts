import accounts from "@decentralized-convex/accounts/convex.config";
import messages from "@decentralized-convex/messages/convex.config";
import { definePdsApp } from "@decentralized-convex/server";

import { pdsAuth } from "../pds-auth";

export default definePdsApp({
  auth: pdsAuth,
  plugins: [accounts, messages],
});
