import { createAppUrls } from "@acme/app-config/urls";

import { env } from "~/env";

const options = {
  nodeEnv: env.VITE_NODE_ENV,
  worktreeId: env.VITE_WORKTREE_ID,
} as const;

export const appUrls = createAppUrls(options);
