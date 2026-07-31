import type { Infer } from "convex/values";
import { v } from "convex/values";

import { providerMetadata, providerOptions } from "./shared";

export const vTextPart = v.object({
  type: v.literal("text"),
  text: v.string(),
  providerOptions,
  providerMetadata,
});

export const vImagePart = v.object({
  type: v.literal("image"),
  image: v.union(v.string(), v.bytes()),
  mediaType: v.optional(v.string()),
  /** @deprecated Use `mediaType` instead. */
  mimeType: v.optional(v.string()),
  providerOptions,
});

export const vFilePart = v.object({
  type: v.literal("file"),
  data: v.union(v.string(), v.bytes()),
  filename: v.optional(v.string()),
  mediaType: v.optional(v.string()),
  /** @deprecated Use `mediaType` instead. */
  mimeType: v.optional(v.string()),
  providerOptions,
  providerMetadata,
});

export const vUserContent = v.union(
  v.string(),
  v.array(v.union(vTextPart, vImagePart, vFilePart)),
);

export const vReasoningPart = v.object({
  type: v.literal("reasoning"),
  text: v.string(),
  signature: v.optional(v.string()),
  providerOptions,
  providerMetadata,
});

export const vRedactedReasoningPart = v.object({
  type: v.literal("redacted-reasoning"),
  data: v.string(),
  providerOptions,
  providerMetadata,
});

export const vReasoningDetails = v.array(
  v.union(
    vReasoningPart,
    v.object({
      type: v.literal("text"),
      text: v.string(),
      signature: v.optional(v.string()),
    }),
    v.object({ type: v.literal("redacted"), data: v.string() }),
  ),
);

export const vSourcePart = v.union(
  v.object({
    type: v.literal("source"),
    sourceType: v.literal("url"),
    id: v.string(),
    url: v.string(),
    title: v.optional(v.string()),
    providerOptions,
    providerMetadata,
  }),
  v.object({
    type: v.literal("source"),
    sourceType: v.literal("document"),
    id: v.string(),
    mediaType: v.string(),
    title: v.string(),
    filename: v.optional(v.string()),
    providerOptions,
    providerMetadata,
  }),
);
export type SourcePart = Infer<typeof vSourcePart>;

export const vSource = v.union(
  v.object({
    type: v.optional(v.literal("source")),
    sourceType: v.literal("url"),
    id: v.string(),
    url: v.string(),
    title: v.optional(v.string()),
    providerOptions,
    providerMetadata,
  }),
  v.object({
    type: v.literal("source"),
    sourceType: v.literal("document"),
    id: v.string(),
    mediaType: v.string(),
    title: v.string(),
    filename: v.optional(v.string()),
    providerOptions,
    providerMetadata,
  }),
);
