import type { Infer } from "convex/values";
import { v } from "convex/values";

import { vMessage } from "./message";
import { providerOptions, vCallSettings } from "./shared";

export const vContextOptionsSearchOptions = v.object({
  limit: v.number(),
  textSearch: v.optional(v.boolean()),
  vectorSearch: v.optional(v.boolean()),
  vectorScoreThreshold: v.optional(v.number()),
  messageRange: v.optional(v.object({ before: v.number(), after: v.number() })),
});

export const vContextOptions = v.object({
  excludeToolMessages: v.optional(v.boolean()),
  recentMessages: v.optional(v.number()),
  searchOptions: v.optional(vContextOptionsSearchOptions),
  searchOtherThreads: v.optional(v.boolean()),
});

export const vStorageOptions = v.object({
  saveMessages: v.optional(
    v.union(v.literal("all"), v.literal("none"), v.literal("promptAndOutput")),
  ),
});

const vPromptFields = {
  system: v.optional(v.string()),
  prompt: v.optional(v.string()),
  messages: v.optional(v.array(vMessage)),
  promptMessageId: v.optional(v.string()),
};

const vCommonArgs = {
  userId: v.optional(v.string()),
  threadId: v.optional(v.string()),
  contextOptions: v.optional(vContextOptions),
  storageOptions: v.optional(vStorageOptions),
  providerOptions,
  callSettings: v.optional(vCallSettings),
  ...vPromptFields,
};

export const vTextArgs = v.object({
  ...vCommonArgs,
  stream: v.optional(v.boolean()),
  toolChoice: v.optional(
    v.union(
      v.literal("auto"),
      v.literal("none"),
      v.literal("required"),
      v.object({ type: v.literal("tool"), toolName: v.string() }),
    ),
  ),
  maxSteps: v.optional(v.number()),
  experimental_continueSteps: v.optional(v.boolean()),
});
export type TextArgs = Infer<typeof vTextArgs>;

export const vSafeObjectArgs = v.object(vCommonArgs);
export type SafeObjectArgs = Infer<typeof vSafeObjectArgs>;
