import type { ProviderMetadata } from "ai";

export function mergeProviderMetadata(
  existing: ProviderMetadata | undefined,
  part: ProviderMetadata | undefined,
) {
  if (!existing && !part) return undefined;
  if (!existing) return part;
  if (!part) return existing;
  const merged = existing;
  for (const [provider, metadata] of Object.entries(part)) {
    merged[provider] = {
      ...merged[provider],
      ...metadata,
    };
  }
  return merged;
}
