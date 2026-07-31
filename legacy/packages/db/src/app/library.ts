import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import { authedMutation, authedQuery } from "../convex_helpers";
import {
  getFileByKeyHelper,
  getPublicFile,
  storeFileMetadata,
  verifyOwnership,
  vFileMetadata,
} from "./file_helpers";
import {
  apiStorageTriggerMutation,
  authedStorageTriggerMutation,
  getStorageHelper,
  internalStorageTriggerMutation,
} from "./storage";

/**
 * Store file metadata in convex after the files have
 * been uploaded to uploadthing storage.
 */
export const uploadFileMetadata = apiStorageTriggerMutation({
  args: {
    file: vFileMetadata,
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { file, userId } = args;
    return await storeFileMetadata(ctx, userId, file);
  },
});

/**
 * Store files after image generation.
 */
export const uploadFileMetadataInternal = internalStorageTriggerMutation({
  args: {
    file: vFileMetadata,
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { file, userId } = args;
    return await storeFileMetadata(ctx, userId, file);
  },
});

export const deleteFiles = authedStorageTriggerMutation({
  args: {
    ids: v.array(v.id("files")),
  },
  handler: async (ctx, args) => {
    const { ids } = args;
    const files = await verifyOwnership(ctx, ctx.user, ids);

    // delete file from db
    for (const file of files) {
      await ctx.db.delete(file._id);
    }

    // delete file from storage
    await ctx.scheduler.runAfter(
      0,

      internal.app.actions.deleteFilesFromStorage,
      {
        keys: files.map((file) => file.key),
      },
    );
  },
});

export const renameFile = authedMutation({
  args: {
    id: v.id("files"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { id, name } = args;

    await verifyOwnership(ctx, ctx.user, [id]);

    // update file name
    await ctx.db.patch(id, {
      fileName: name,
    });
  },
});

export const getUserFiles = authedQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    direction: v.union(v.literal("asc"), v.literal("desc")),
    tab: v.union(v.literal("all"), v.literal("images"), v.literal("documents")),
    sort: v.union(v.literal("date")),
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { paginationOpts, direction, tab, searchTerm } = args;
    let paginated;
    if (searchTerm) {
      paginated = await ctx.db
        .query("files")
        .withSearchIndex("search_file_name", (q) =>
          q.search("fileName", searchTerm).eq("userId", ctx.user.subject),
        )
        .filter((q) => {
          if (tab === "images") {
            return q.or(
              q.eq(q.field("fileType"), "image/jpeg"),
              q.eq(q.field("fileType"), "image/png"),
              q.eq(q.field("fileType"), "image/webp"),
            );
          }
          if (tab === "documents") {
            return q.or(q.eq(q.field("fileType"), "application/pdf"));
          }
          return q.neq(q.field("fileType"), undefined);
        })
        .paginate(paginationOpts);
    } else {
      paginated = await ctx.db
        .query("files")
        .withIndex("by_user", (q) => q.eq("userId", ctx.user.subject))
        .filter((q) => {
          if (tab === "images") {
            return q.or(
              q.eq(q.field("fileType"), "image/jpeg"),
              q.eq(q.field("fileType"), "image/png"),
              q.eq(q.field("fileType"), "image/webp"),
            );
          }
          if (tab === "documents") {
            return q.eq(q.field("fileType"), "application/pdf");
          }
          return q.neq(q.field("fileType"), undefined);
        })
        .order(direction)
        .paginate(paginationOpts);
    }
    return {
      ...paginated,
      page: paginated.page.map((file) => getPublicFile(file)),
    };
  },
});

export const getStorageStatus = authedQuery({
  handler: async (ctx) => {
    const { storageUsed, storageLimit } = await getStorageHelper(
      ctx,
      ctx.user.subject,
    );
    return {
      storageUsed,
      storageLimit,
    };
  },
});

export const getFilesByName = internalQuery({
  args: {
    fileNames: v.array(v.string()),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { fileNames, userId } = args;
    const files = [];
    for (const fileName of fileNames) {
      const file = await ctx.db
        .query("files")
        .withSearchIndex("search_file_name", (q) =>
          q.search("fileName", fileName).eq("userId", userId),
        )
        .first();
      if (!file) {
        continue;
      }
      files.push(file);
    }
    return files;
  },
});

export const getFileByKeyInternal = internalQuery({
  args: {
    key: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { key, userId } = args;
    const file = await getFileByKeyHelper(ctx, key);
    if (!file) {
      return null;
    }
    if (file.userId !== userId) {
      throw new ConvexError("Unauthorized");
    }
    return getPublicFile(file);
  },
});

export const getFileByKey = authedQuery({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const { key } = args;
    const file = await getFileByKeyHelper(ctx, key);
    if (!file) {
      return null;
    }
    if (file.userId !== ctx.user.subject) {
      throw new ConvexError("Unauthorized");
    }
    return getPublicFile(file);
  },
});

export const getFilesByKeys = internalQuery({
  args: {
    keys: v.array(v.string()),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { keys, userId } = args;
    const files = [];
    for (const key of keys) {
      const file = await getFileByKeyHelper(ctx, key);
      if (!file) {
        continue;
      }
      if (file.userId !== userId) {
        throw new ConvexError("Unauthorized");
      }
      files.push(file);
    }
    return files.map((file) => getPublicFile(file));
  },
});
