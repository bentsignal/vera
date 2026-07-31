import type { CustomCtx } from "convex-helpers/server/customFunctions";
import type { UserIdentity } from "convex/server";
import type { Infer } from "convex/values";
import { ConvexError, v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type {
  apiStorageTriggerMutation,
  internalStorageTriggerMutation,
} from "./storage";
import { env } from "../convex.env";

export async function verifyOwnership(
  ctx: QueryCtx | MutationCtx,
  user: UserIdentity,
  fileIds: Doc<"files">["_id"][],
) {
  // make sure files exist, and belong to user
  const files = [];
  for (const fileId of fileIds) {
    const file = await ctx.db.get(fileId);
    if (!file) {
      throw new ConvexError("File not found");
    }
    if (file.userId !== user.subject) {
      throw new ConvexError("Unauthorized");
    }
    files.push(file);
  }
  return files;
}

export function getFileUrl(key: string) {
  return `https://${env.UPLOADTHING_APP_ID}.ufs.sh/f/${key}`;
}

/**
 * Get the user facing data for a file
 */
export function getPublicFile(file: Doc<"files">) {
  return {
    id: file._id,
    key: file.key,
    url: getFileUrl(file.key),
    fileName: file.fileName,
    mimeType: file.fileType,
    size: file.size,
  };
}

export const vFileMetadata = v.object({
  key: v.string(),
  name: v.string(),
  type: v.string(),
  size: v.number(),
});

export async function storeFileMetadata(
  ctx: CustomCtx<
    typeof apiStorageTriggerMutation | typeof internalStorageTriggerMutation
  >,
  userId: string,
  file: Infer<typeof vFileMetadata>,
) {
  return await ctx.db.insert("files", {
    userId,
    fileName: file.name,
    fileType: file.type,
    key: file.key,
    size: file.size,
  });
}

export async function getFileByKeyHelper(ctx: QueryCtx, key: string) {
  const file = await ctx.db
    .query("files")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  return file;
}
