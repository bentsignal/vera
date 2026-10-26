"use node";

import decode from "heic-decode";
import jpeg from "jpeg-js";
import { v } from "convex/values";

import { JPEG_QUALITY, MAX_PIXELS, MAX_SIDE, shrink } from "../assistant-images";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

// Converting a photo the gateway can't fetch (HEIC) to a JPEG it can
// (assistant-images.ts). In Node, for its memory: decoding a 24-megapixel
// photo takes about 450 MB, and the default runtime has 64.

/** Converts one photo and records the JPEG, or that it can't be shown. */
export const convert = internalAction({
  args: { source: v.string() },
  handler: async (ctx, { source }) => {
    let storageId;
    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const images = await decode.all({
        buffer: new Uint8Array(await response.arrayBuffer()),
      });
      try {
        const first = images.at(0);
        if (first === undefined) throw new Error("No image in the file");
        if (first.width * first.height > MAX_PIXELS) {
          throw new Error(`Too large: ${first.width}x${first.height}`);
        }
        const image = shrink(await first.decode(), MAX_SIDE);
        const encoded = jpeg.encode(
          { data: image.data, height: image.height, width: image.width },
          JPEG_QUALITY,
        );
        storageId = await ctx.storage.store(
          new Blob([new Uint8Array(encoded.data)], { type: "image/jpeg" }),
        );
      } finally {
        images.dispose();
      }
    } catch (error) {
      console.error(`Couldn't convert ${source} for an assistant`, error);
    }
    await ctx.runMutation(internal.assistantImages.record, {
      source,
      storageId,
    });
  },
});
