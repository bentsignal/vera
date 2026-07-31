import type { FileRouter } from "uploadthing/server";
import { auth } from "@clerk/tanstack-react-start/server";
import { createUploadthing, UploadThingError, UTApi } from "uploadthing/server";

import { api } from "@acme/db/api";

import { env } from "~/env";
import { getConvexHttpClient } from "~/lib/convex-server";
import { tryCatch } from "~/lib/utils";

const utapi = new UTApi({
  token: env.UPLOADTHING_TOKEN,
});

const f = createUploadthing();

// FileRouter for your app, can contain multiple FileRoutes
export const ourFileRouter = {
  // Define as many FileRoutes as you like, each with a unique routeSlug
  uploadRoute: f({
    "image/jpeg": {
      maxFileSize: "32MB",
      maxFileCount: 50,
    },
    "image/png": {
      maxFileSize: "32MB",
      maxFileCount: 50,
    },
    "image/webp": {
      maxFileSize: "32MB",
      maxFileCount: 50,
    },
    "application/pdf": {
      maxFileSize: "32MB",
      maxFileCount: 50,
    },
  })
    .middleware(async ({ files }) => {
      const { userId } = await auth();

      if (!userId) throw new UploadThingError("Unauthorized");

      // calculate the total size of the files
      const payloadSize = files.reduce((acc, file) => acc + file.size, 0);

      // storage and rate limit check
      const convex = getConvexHttpClient();
      const { data, error } = await tryCatch(
        convex.mutation(api.app.storage.verifyUpload, {
          userId,
          apiKey: env.CONVEX_INTERNAL_KEY,
          payloadSize,
        }),
      );

      // unexpected error
      if (error) {
        console.error(error);
        throw new UploadThingError(
          "An error occurred while verifying upload, please try again later",
        );
      }

      // expected error
      if (!data?.allow) {
        console.error("Upload not allowed", data?.reason);
        throw new UploadThingError(
          String(data?.reason ?? "Upload not allowed"),
        );
      }

      return { userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const convex = getConvexHttpClient();
      // upload metadata to convex
      const { error } = await tryCatch(
        convex.mutation(api.app.library.uploadFileMetadata, {
          file: {
            key: file.key,
            name: file.name,
            type: file.type,
            size: file.size,
          },
          userId: metadata.userId,
          apiKey: env.CONVEX_INTERNAL_KEY,
        }),
      );

      // if there is an error uploading metadata to convex, delete the file from storage
      if (error) {
        console.error("Error uploading metadata to convex", error);
        const { error: deleteError } = await tryCatch(
          utapi.deleteFiles(file.key),
        );
        if (deleteError) {
          console.error(
            "Error deleting file from storage following metadata upload error",
            deleteError,
          );
        }
        return {
          error:
            "An error occurred while uploading file, please try again later",
        };
      }

      return { error: null };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
