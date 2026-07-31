import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const runtimeEnv =
  typeof window === "undefined"
    ? ((
        globalThis as {
          process?: { env?: Record<string, string | undefined> };
        }
      ).process?.env ?? import.meta.env)
    : import.meta.env;

export const env = createEnv({
  clientPrefix: "VITE_",
  server: {
    CLERK_SECRET_KEY: z.string().min(1),
    CONVEX_DEPLOYMENT: z.string().min(1),
    CONVEX_INTERNAL_KEY: z.string().min(1),
    CONVEX_DEPLOY_KEY: z.string().min(1).optional(),
  },
  client: {
    VITE_NODE_ENV: z.enum(["development", "production"]).default("production"),
    VITE_WORKTREE_ID: z.string().optional(),
    VITE_DEV_ALLOWED_HOST: z.string().optional(),
    VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    VITE_CLERK_SIGN_IN_URL: z.string().min(1),
    VITE_CLERK_SIGN_UP_URL: z.string().min(1),
    VITE_CONVEX_URL: z.string().min(1),
  },
  runtimeEnv,
  emptyStringAsUndefined: true,
});
