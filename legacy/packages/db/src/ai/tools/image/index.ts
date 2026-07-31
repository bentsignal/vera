import { z } from "zod";

import { internal } from "../../../_generated/api";
import { createTool } from "../../../agent/tools";
import { PLANS } from "../../../billing/plans";
import { zAspectRatio } from "./types";

interface InitImageResult {
  response: string;
}

const initWarning = `
***IMPORTANT*** before calling this tool, you must call the imageGenerationInit
tool. You must do this **EACH TIME** you want to generate or edit a new image. Previous
calls to the initialization tool will not be valid.
`;

const keyWarning = `
**IMPORTANT**: Do not include the file key in your text response to the user. The
keys are included for context, not to be shown to the user.
`;

// The purpose of this tool is so that the status shows "Generating Image" instead of "Reasoning" when the image is being generated.
// Its dumb tho and I hope I can get rid of it at some point.
export const initImage = createTool({
  description: `A tool to prepare for image generation or editing. After this tool
  call has completed, you are free to call either the generateImage or editImage
  tool. Each call to this tool is only valid for one image generation or editing
  request. After that, another request to this tool must be made.`,
  inputSchema: z.object({}),
  execute: (_ctx, _args): Promise<InitImageResult> => {
    // TODO: remove once streaming tool call results is implemented
    return Promise.resolve({
      response:
        "All set, you can now call the generateImage or editImage tool.",
    });
  },
});

interface GenerateImageResult {
  key: string | null;
}

export const generateImage = createTool({
  description: `

    Generate an image or graphic. Will return the key of the image file if generation
    was successful. If an error occurs, the key will be null.

    ${keyWarning}

    ${initWarning}

    `,
  inputSchema: z.object({
    prompt: z.string().describe("The prompt to use to generate the image."),
    aspectRatio: zAspectRatio,
  }),
  execute: async (ctx, args): Promise<GenerateImageResult> => {
    const { prompt, aspectRatio } = args;

    if (!ctx.threadId || !ctx.userId) {
      throw new Error("Thread ID is required");
    }

    // only premium users can generate images
    const plan = await ctx.runQuery(internal.user.subscription.getPlanTier, {
      userId: ctx.userId,
    });
    if (plan < PLANS.Premium.tier) {
      return {
        key: "You must be a premium or ultra user to generate images.",
      };
    }

    // jump to node runtime to generate the image.
    const result = await ctx.runAction(
      internal.ai.tools.image.actions.generate,
      {
        prompt,
        userId: ctx.userId,
        threadId: ctx.threadId,
        aspectRatio,
      },
    );

    if (!result.success) {
      console.error(result.value);
      return {
        key: null,
      };
    }

    return {
      key: result.value,
    };
  },
});

export const editImage = createTool({
  description: `

    A tool for creating new images from existing ones. It accepts an array
    of image keys and a prompt. It will use these images and the prompt to
    create a new image. This new image will be saved to the user's library,
    and the storage key will be returned

    ${keyWarning}

    ${initWarning}

  `,
  inputSchema: z.object({
    prompt: z.string().describe("The prompt to use to edit the images."),
    imageKeys: z.array(z.string()).describe("The keys of the images to edit."),
  }),
  execute: async (ctx, args): Promise<GenerateImageResult> => {
    const { prompt, imageKeys } = args;

    if (!ctx.threadId || !ctx.userId) {
      throw new Error("Thread ID is required");
    }

    // only premium users can generate images
    const plan = await ctx.runQuery(internal.user.subscription.getPlanTier, {
      userId: ctx.userId,
    });
    if (plan < PLANS.Premium.tier) {
      return {
        key: "You must be a premium or ultra user to generate images.",
      };
    }

    const files = await ctx.runQuery(internal.app.library.getFilesByKeys, {
      keys: imageKeys,
      userId: ctx.userId,
    });
    if (files.length === 0) {
      throw new Error("Images not found");
    }

    // jump to node runtime to edit the image.
    const result = await ctx.runAction(internal.ai.tools.image.actions.edit, {
      prompt,
      urls: files.map((file: { url: string }) => file.url),
      userId: ctx.userId,
      threadId: ctx.threadId,
    });

    if (!result.success) {
      console.error(result.value);
      return {
        key: null,
      };
    }

    return {
      key: result.value,
    };
  },
});
