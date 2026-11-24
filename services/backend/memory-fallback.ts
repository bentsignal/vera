// Vera's memory (convex/memory.ts) helps a reply but is never required for
// one. Looking it up embeds text through the AI gateway, and when that
// fails (the embeddings provider returning 502s, say), the reply goes
// ahead without what memory would have added instead of failing outright.

export async function unlessMemoryFails<T>(
  lookup: () => Promise<T>,
  without: T,
): Promise<T> {
  try {
    return await lookup();
  } catch (error) {
    console.warn("memory lookup failed; replying without it", error);
    return without;
  }
}
