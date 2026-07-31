"use node";

import { v } from "convex/values";

import { internal } from "../../../_generated/api";
import { internalAction } from "../../../_generated/server";
import { tryCatch } from "../../../lib/utils";
import { falImageGenerationModels } from "../../models/image";
import {
  downloadImage,
  editImageFalAI,
  generateImageFalAI,
  saveImage,
} from "./helpers";
import { vAspectRatio } from "./types";

interface GenerateImageOutput {
  success: boolean;
  value: string;
}

export const generate = internalAction({
  args: v.object({
    prompt: v.string(),
    userId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    aspectRatio: vAspectRatio,
  }),
  handler: async (ctx, args): Promise<GenerateImageOutput> => {
    const { prompt, userId, threadId, aspectRatio } = args;

    // generate image
    const model = falImageGenerationModels["fal-ai/gemini-25-flash-image"];
    const generation = await tryCatch(
      generateImageFalAI(prompt, aspectRatio, model),
    );
    if (generation.error) {
      console.error(generation.error);
      return {
        success: false,
        value: "Ran into an issue while generating the image.",
      };
    }

    // download image data from url
    const download = await tryCatch(downloadImage(generation.data));
    if (download.error) {
      console.error(download.error);
      return {
        success: false,
        value: "Ran into an issue while downloading the image.",
      };
    }

    // save result to user's library
    const save = await tryCatch(
      saveImage({ ctx, prompt, image: download.data, userId, threadId }),
    );
    if (save.error) {
      console.error(save.error);
      return {
        success: false,
        value: "Ran into an issue while saving the image.",
      };
    }

    // log usage
    if (userId) {
      const cost = model.cost.other;
      await ctx.runMutation(internal.user.usage.log, {
        userId: userId,
        type: "tool_call",
        cost: cost,
      });
    }

    return {
      success: true,
      value: save.data,
    };
  },
});

export const edit = internalAction({
  args: v.object({
    prompt: v.string(),
    urls: v.array(v.string()),
    userId: v.optional(v.string()),
    threadId: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<GenerateImageOutput> => {
    const { prompt, urls, userId, threadId } = args;

    // edit image
    const model = falImageGenerationModels["fal-ai/gemini-25-flash-image/edit"];
    const editResult = await tryCatch(editImageFalAI(prompt, urls, model));
    if (editResult.error) {
      console.error(editResult.error);
      return {
        success: false,
        value: "Ran into an issue while editing the image.",
      };
    }

    // download image data from url
    const download = await tryCatch(downloadImage(editResult.data));
    if (download.error) {
      console.error(download.error);
      return {
        success: false,
        value: "Ran into an issue while downloading the image.",
      };
    }

    // save result to user's library
    const save = await tryCatch(
      saveImage({ ctx, prompt, image: download.data, userId, threadId }),
    );
    if (save.error) {
      console.error(save.error);
      return {
        success: false,
        value: "Ran into an issue while saving the image.",
      };
    }

    // log usage
    if (userId) {
      const cost = model.cost.other;
      await ctx.runMutation(internal.user.usage.log, {
        userId: userId,
        type: "tool_call",
        cost: cost,
      });
    }

    return {
      success: true,
      value: save.data,
    };
  },
});
