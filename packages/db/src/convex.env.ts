import { createEnv } from "convex-env";
import {
  clerk,
  environment,
  polar,
  resend,
  uploadthing,
} from "convex-env/presets";
import { v } from "convex/values";

export const env = createEnv({
  ...environment,
  ...uploadthing,
  ...resend,
  ...polar,
  ...clerk,
  CLERK_SECRET_KEY: v.string(),
  EXA_API_KEY: v.string(),
  FAL_KEY: v.string(),
  GOOGLE_API_KEY: v.string(),
  OPENAI_API_KEY: v.string(),
  OPENROUTER_API_KEY: v.string(),
  AI_GATEWAY_API_KEY: v.string(),
  NEXT_CONVEX_INTERNAL_KEY: v.string(),
});
