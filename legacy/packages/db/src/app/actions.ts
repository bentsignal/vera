"use node";

import { v } from "convex/values";

import { internalAction } from "../_generated/server";
import { utapi } from "../uploadthing";

export const deleteFilesFromStorage = internalAction({
  args: {
    keys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await utapi.deleteFiles(args.keys);
  },
});
