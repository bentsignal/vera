"use node";

import { v } from "convex/values";
import decode from "heic-decode";
import jpeg from "jpeg-js";

import {
  JPEG_QUALITY,
  MAX_PIXELS,
  MAX_SIDE,
  shrink,
} from "../assistant-images";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

// Converting a photo the gateway can't fetch (HEIC) to a JPEG it can
// (assistant-images.ts). In Node, for its memory: decoding a 24-megapixel
// photo takes about 450 MB, and the default runtime has 64.

/**
 * Converts one photo and records the JPEG, or that it can't be shown. One
 * too large to decode (by the size the app sent with it) isn't tried.
 */
export const convert = internalAction({
  args: { pixels: v.optional(v.number()), source: v.string() },
  handler: async (ctx, { pixels, source }) => {
    let storageId;
    try {
      if (pixels !== undefined && pixels > MAX_PIXELS) {
        throw new Error(`Too large: ${pixels} pixels`);
      }
      const response = await fetch(source);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const decoded = await decode({
        buffer: new Uint8Array(await response.arrayBuffer()),
      });
      const image = shrink(decoded, MAX_SIDE);
      const encoded = jpeg.encode(
        { data: image.data, height: image.height, width: image.width },
        JPEG_QUALITY,
      );
      storageId = await ctx.storage.store(
        new Blob([new Uint8Array(encoded.data)], { type: "image/jpeg" }),
      );
    } catch (error) {
      console.error(`Couldn't convert ${source} for an assistant`, error);
    }
    await ctx.runMutation(internal.assistantImages.record, {
      source,
      storageId,
    });
  },
});
