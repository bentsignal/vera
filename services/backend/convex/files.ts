import { ConvexError, v } from "convex/values";

import type { ActionCtx, MutationCtx } from "./_generated/server";
import {
  localAccountId,
  MAX_UPLOAD_BYTES,
  reservedBytes,
  UPLOAD_WINDOW_MS,
  uploadContentType,
  uploadExtension,
  uploadOversize,
  uploadRefusal,
} from "../upload-limits";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import {
  bunnyStorageConfig,
  deleteStorageObject,
  presignStorageUpload,
  storageObjectSize,
  UPLOAD_URL_LIFETIME_SECONDS,
} from "./bunny";
import { requireEnvironment } from "./lib";

// Messages store only public URLs, so the provider can change without
// touching message data.
//
// Only this PDS's own accounts upload here; people from other servers
// upload to their own. Each upload counts toward the account's allowance
// (upload-limits.ts) from the moment its address is made. The app uploads
// straight to bunny.net, which doesn't hold an upload to the size it was
// signed for, so each one is checked once it lands and deleted if it's
// bigger than its kind allows.

const kind = v.union(v.literal("image"), v.literal("video"), v.literal("file"));

/**
 * When to look for an upload after its address is made: just after the
 * address expires, then again in case it was still arriving: each delay
 * after the one before, under a day in all, before clearOld forgets it.
 */
const CHECK_AFTER_MS: readonly number[] = [
  UPLOAD_URL_LIFETIME_SECONDS * 1000 + 60_000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  16 * 60 * 60 * 1000,
];

async function requireLocalAccount(ctx: ActionCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError({ code: "AUTHENTICATED_ACCOUNT_REQUIRED" });
  }
  const accountId = localAccountId(
    identity,
    requireEnvironment("FEDERATION_DOMAIN"),
  );
  if (accountId === null) {
    throw new ConvexError({ code: "LOCAL_ACCOUNT_REQUIRED" });
  }
  return accountId;
}

/**
 * Where and how the app should upload one attachment. `size` is the file's
 * length in bytes, or 0 when the app doesn't know it.
 */
export const createUpload = action({
  args: {
    kind,
    mimeType: v.string(),
    name: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const accountId = await requireLocalAccount(ctx);
    const storage = bunnyStorageConfig();
    const path =
      storage === null
        ? undefined
        : `${storage.prefix}/${crypto.randomUUID()}.${uploadExtension(args.name)}`;
    await ctx.runMutation(internal.files.reserve, {
      accountId,
      kind: args.kind,
      path,
      size: args.size,
    });
    if (storage === null || path === undefined) {
      return {
        protocol: "convex" as const,
        url: await ctx.storage.generateUploadUrl(),
      };
    }
    return {
      protocol: "put" as const,
      ...(await presignStorageUpload(
        storage,
        path,
        uploadContentType(args.mimeType),
        args.size,
      )),
    };
  },
});

/** Counts an upload toward the account's allowance, or refuses it. */
export const reserve = internalMutation({
  args: {
    accountId: v.string(),
    kind,
    path: v.optional(v.string()),
    size: v.number(),
  },
  handler: async (ctx, { accountId, kind, path, size }) => {
    const now = Date.now();
    const recent = await ctx.db
      .query("uploads")
      .withIndex("by_account", (q) =>
        q
          .eq("accountId", accountId)
          .gt("_creationTime", now - UPLOAD_WINDOW_MS),
      )
      .collect();
    const refusal = uploadRefusal(
      recent.map((upload) => ({ ...upload, createdAt: upload._creationTime })),
      kind,
      size,
      now,
    );
    if (refusal !== null) throw new ConvexError({ code: refusal });
    const uploadId = await ctx.db.insert("uploads", {
      accountId,
      bytes: reservedBytes(kind, size),
      checked: false,
      kind,
      path,
    });
    await ctx.scheduler.runAfter(CHECK_AFTER_MS[0] ?? 0, internal.files.check, {
      attempt: 0,
      uploadId,
    });
  },
});

export const uploadOf = internalQuery({
  args: { uploadId: v.id("uploads") },
  handler: (ctx, { uploadId }) => ctx.db.get(uploadId),
});

/** Records what an upload came to. */
export const settle = internalMutation({
  args: {
    bytes: v.number(),
    oversize: v.boolean(),
    uploadId: v.id("uploads"),
  },
  handler: async (ctx, { bytes, oversize, uploadId }) => {
    if ((await ctx.db.get(uploadId)) === null) return;
    await ctx.db.patch(uploadId, {
      bytes,
      checked: true,
      ...(oversize && { oversize }),
    });
  },
});

/**
 * Looks at an upload once it should have landed: records its real size,
 * and deletes it if it's bigger than its kind allows.
 */
export const check = internalAction({
  args: { attempt: v.number(), uploadId: v.id("uploads") },
  handler: async (ctx, { attempt, uploadId }) => {
    const upload = await ctx.runQuery(internal.files.uploadOf, { uploadId });
    if (upload === null || upload.checked) return;
    const storage = bunnyStorageConfig();
    if (upload.path === undefined || storage === null) {
      // Convex storage: completeUpload checks it, if the app finished it.
      await ctx.runMutation(internal.files.settle, {
        bytes: upload.bytes,
        oversize: false,
        uploadId,
      });
      return;
    }
    const size = await storageObjectSize(storage, upload.path);
    if (size === null) {
      if (attempt + 1 < CHECK_AFTER_MS.length) {
        await ctx.scheduler.runAfter(
          CHECK_AFTER_MS[attempt + 1] ?? 0,
          internal.files.check,
          {
            attempt: attempt + 1,
            uploadId,
          },
        );
        return;
      }
      await ctx.runMutation(internal.files.settle, {
        bytes: 0,
        oversize: false,
        uploadId,
      });
      return;
    }
    const oversize = uploadOversize(upload.kind, size);
    if (oversize) await deleteStorageObject(storage, upload.path);
    await ctx.runMutation(internal.files.settle, {
      bytes: size,
      oversize,
      uploadId,
    });
  },
});

/** Turns a finished Convex storage upload into a public URL. */
export const completeUpload = mutation({
  args: {
    // Sent by app versions from 2026-11; older ones get the largest limit.
    kind: v.optional(kind),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { kind: uploadKind, storageId }) => {
    const accountId = await requireLocalAccount(ctx);
    const file = await ctx.db.system.get(storageId);
    if (file === null) throw new ConvexError({ code: "UPLOAD_NOT_FOUND" });
    const pending = await ctx.db
      .query("uploads")
      .withIndex("by_account", (q) =>
        q
          .eq("accountId", accountId)
          .gt("_creationTime", Date.now() - UPLOAD_WINDOW_MS),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("path"), undefined),
          q.eq(q.field("checked"), false),
        ),
      )
      .first();
    const oversize =
      file.size >
      (uploadKind === undefined
        ? Math.max(...Object.values(MAX_UPLOAD_BYTES))
        : MAX_UPLOAD_BYTES[uploadKind]);
    if (pending !== null) {
      await ctx.db.patch(pending._id, {
        bytes: file.size,
        checked: true,
        ...(oversize && { oversize }),
      });
    }
    if (oversize || pending === null) {
      await ctx.storage.delete(storageId);
      throw new ConvexError({
        code: oversize ? "UPLOAD_TOO_LARGE" : "UPLOAD_NOT_FOUND",
      });
    }
    const url = await ctx.storage.getUrl(storageId);
    if (url === null) throw new ConvexError({ code: "UPLOAD_NOT_FOUND" });
    return { url };
  },
});

/**
 * Operator command:
 * `npx convex run files:reset '{"accountId":"someone@vera.chat"}'`.
 * Gives someone their full allowance back, and lifts a day's stop for an
 * upload that came out too big.
 */
export const reset = internalMutation({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();
    // Uploads still waiting for their check stay, so it still runs.
    await Promise.all(
      uploads
        .filter((upload) => upload.checked)
        .map((upload) => ctx.db.delete(upload._id)),
    );
  },
});

/** Hourly: forgets uploads older than the window (crons.ts). */
export const clearOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("uploads")
      .withIndex("by_creation_time", (q) =>
        // An hour past the window, so the last check has run.
        q.lt("_creationTime", Date.now() - UPLOAD_WINDOW_MS - 60 * 60 * 1000),
      )
      .take(500);
    await Promise.all(old.map((row) => ctx.db.delete(row._id)));
    if (old.length === 500) {
      await ctx.scheduler.runAfter(0, internal.files.clearOld, {});
    }
  },
});
