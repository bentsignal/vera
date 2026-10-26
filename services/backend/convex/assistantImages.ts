import { v } from "convex/values";

import type { ActionCtx } from "./_generated/server";
import { fetchableByGateway } from "../assistant-images";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

// Photos an assistant is shown in a format the gateway can't fetch (HEIC),
// as the JPEGs they were converted to (assistantImagesNode.ts), so each is
// converted once and every later reply gets the same URL, which keeps the
// prompt cache valid too.

/**
 * How the model is shown each photo, by its own URL: as it is when the
 * gateway fetches it, as its JPEG otherwise (converted now if it hasn't
 * been), or null when it can't be.
 */
export async function imageUrls(
  ctx: ActionCtx,
  images: readonly { mimeType: string; url: string }[],
) {
  const urls = new Map<string, { mimeType: string; url: string } | null>();
  const sources: string[] = [];
  for (const image of images) {
    if (fetchableByGateway(image.mimeType)) urls.set(image.url, image);
    else sources.push(image.url);
  }
  if (sources.length === 0) return urls;
  let known: { source: string; url: string | null }[] = await ctx.runQuery(
    internal.assistantImages.converted,
    { sources },
  );
  const missing = sources.filter(
    (source) => !known.some((image) => image.source === source),
  );
  if (missing.length > 0) {
    await Promise.all(
      missing.map((source) =>
        ctx
          .runAction(internal.assistantImagesNode.convert, { source })
          .catch(async (error: unknown) => {
            // It died (out of memory, say): don't try again every reply.
            console.error(`Converting ${source} failed`, error);
            await ctx.runMutation(internal.assistantImages.record, { source });
          }),
      ),
    );
    known = await ctx.runQuery(internal.assistantImages.converted, {
      sources,
    });
  }
  for (const source of sources) {
    const url = known.find((image) => image.source === source)?.url ?? null;
    urls.set(source, url === null ? null : { mimeType: "image/jpeg", url });
  }
  return urls;
}

/** The photos among `sources` that have been converted (or tried). */
export const converted = internalQuery({
  args: { sources: v.array(v.string()) },
  handler: async (ctx, { sources }) => {
    const found: { source: string; url: string | null }[] = [];
    for (const source of sources) {
      const row = await ctx.db
        .query("assistantImages")
        .withIndex("by_source", (q) => q.eq("source", source))
        .first();
      if (row === null) continue;
      found.push({
        source,
        url:
          row.storageId === undefined
            ? null
            : await ctx.storage.getUrl(row.storageId),
      });
    }
    return found;
  },
});

/** Records a conversion: its JPEG, or none when it couldn't be made. */
export const record = internalMutation({
  args: { source: v.string(), storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, { source, storageId }) => {
    const existing = await ctx.db
      .query("assistantImages")
      .withIndex("by_source", (q) => q.eq("source", source))
      .first();
    if (existing !== null) {
      // Two replies converted it at once: keep the first.
      if (storageId !== undefined) await ctx.storage.delete(storageId);
      return;
    }
    await ctx.db.insert("assistantImages", { source, storageId });
  },
});
