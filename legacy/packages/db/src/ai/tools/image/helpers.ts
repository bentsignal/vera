"use node";

import { fal } from "@fal-ai/client";
import { UTFile } from "uploadthing/server";

import type { ActionCtx } from "../../../_generated/server";
import type { FalImageGenerationModel } from "../../models/types";
import type { AspectRatio } from "./types";
import { internal } from "../../../_generated/api";
import { tryCatch } from "../../../lib/utils";
import { utapi } from "../../../uploadthing";
import { aspectRatioMap } from "./types";

export async function saveImage(params: {
  ctx: ActionCtx;
  prompt: string;
  image: Uint8Array;
  userId?: string;
  threadId?: string;
}) {
  const { ctx, prompt, image, userId, threadId } = params;
  // public is for in user's library, private is for uploadthing
  const { publicFileName, privateFileName } = getFileNames(
    prompt,
    userId,
    threadId,
  );

  // upload image data to uploadthing
  const uploadedFile = await tryCatch(uploadImage(image, privateFileName));
  if (uploadedFile.error) {
    throw new Error(
      `Failed to upload image to uploadthing: ${uploadedFile.error.message}`,
    );
  }

  // save file metadata to convex metadata table, this will log usage for the user
  const { error: uploadFileMetadataError } = await tryCatch(
    ctx.runMutation(internal.app.library.uploadFileMetadataInternal, {
      file: {
        key: uploadedFile.data,
        name: publicFileName,
        type: "image/png",
        size: image.length,
      },
      userId: userId ?? "no-user",
    }),
  );
  if (uploadFileMetadataError) {
    throw new Error(
      `Failed to save file metadata to convex metadata table: ${uploadFileMetadataError.message}`,
    );
  }

  return uploadedFile.data;
}

function getFileNames(prompt: string, userId?: string, threadId?: string) {
  const publicFileName = prompt
    .replace(/[^a-zA-Z0-9]/g, "-")
    .trim()
    .toLowerCase()
    .slice(0, 100);
  let privateFileName = "";
  if (userId) {
    privateFileName += `${userId}-`;
  }
  if (threadId) {
    privateFileName += `${threadId}-`;
  }
  privateFileName += "generated-image.png";
  return {
    publicFileName,
    privateFileName,
  };
}

export async function downloadImage(url: string) {
  const download = await tryCatch(fetch(url));
  if (download.error) {
    throw new Error(`Error downloading image: ${download.error.message}`);
  }
  const conversion = await tryCatch(download.data.arrayBuffer());
  if (conversion.error) {
    throw new Error(
      `Error converting image to uint8Array: ${conversion.error.message}`,
    );
  }
  const uint8Array = new Uint8Array(conversion.data);

  return uint8Array;
}

export async function uploadImage(image: Uint8Array, fileName: string) {
  // upload image to uploadthing
  const arrayBuffer = new ArrayBuffer(image.length);
  const view = new Uint8Array(arrayBuffer);
  view.set(image);
  const blob = new Blob([view], { type: "image/png" });
  const file = new UTFile([blob], fileName, { type: "image/png" });
  const uploadedFile = await utapi.uploadFiles(file);
  if (uploadedFile.error) {
    throw new Error(
      `Error uploading image to uploadthing: ${uploadedFile.error.message}`,
    );
  }
  return uploadedFile.data.key;
}

export async function generateImageFalAI(
  prompt: string,
  aspectRatio: AspectRatio,
  model: FalImageGenerationModel,
) {
  if (model.type !== "text-to-image") {
    throw new Error("Model is not a text-to-image model");
  }
  const { data: result, error: generationError } = await tryCatch(
    fal.subscribe(model.model, {
      input: {
        prompt,
        num_images: 1,
        aspect_ratio: aspectRatioMap[aspectRatio],
      },
    }),
  );
  if (generationError) {
    throw new Error(
      `Error generating image with Fal AI: ${generationError.message}`,
    );
  }
  try {
    const imageUrl = result.data.images[0]?.url;
    if (!imageUrl) {
      throw new Error("No image URL found in Fal AI response");
    }
    return imageUrl;
  } catch (error) {
    throw new Error(
      `Error retrieving result from Fal AI response, ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export async function editImageFalAI(
  prompt: string,
  urls: string[],
  model: FalImageGenerationModel,
) {
  if (model.type !== "image-to-image") {
    throw new Error("Model is not a image-to-image model");
  }
  const { data: result, error: generationError } = await tryCatch(
    fal.subscribe(model.model, {
      input: {
        prompt,
        image_urls: urls,
      },
    }),
  );
  if (generationError) {
    throw new Error(
      `Error editing image with Fal AI: ${generationError.message}`,
    );
  }
  try {
    const imageUrl = result.data.images[0]?.url;
    if (!imageUrl) {
      throw new Error("No image URL found in Fal AI response");
    }
    return imageUrl;
  } catch (error) {
    throw new Error(
      `Error retrieving result from Fal AI response, ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
